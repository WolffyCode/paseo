import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { ConfirmDialogInput } from "@/utils/confirm-dialog";
import {
  requestArchiveSubagent,
  resolveArchiveSubagentDialog,
  type ArchiveSubagentDeps,
  type ResolveArchiveSubagentDialogInput,
} from "./archive-subagent";

interface RecordedArchive {
  serverId: string;
  agentId: string;
}

interface FakeArchiveSubagentEnv {
  deps: ArchiveSubagentDeps;
  recordedArchives: RecordedArchive[];
  recordedConfirmInputs: ConfirmDialogInput[];
  recordedErrors: unknown[];
  setSubagent(id: string, snapshot: ResolveArchiveSubagentDialogInput | undefined): void;
}

function createFakeEnv(
  options: {
    confirmResult?: boolean;
    initialSubagents?: Array<{ id: string; snapshot: ResolveArchiveSubagentDialogInput }>;
  } = {},
): FakeArchiveSubagentEnv {
  const subagents = new Map<string, ResolveArchiveSubagentDialogInput | undefined>();
  for (const entry of options.initialSubagents ?? []) {
    subagents.set(entry.id, entry.snapshot);
  }
  const recordedArchives: RecordedArchive[] = [];
  const recordedConfirmInputs: ConfirmDialogInput[] = [];
  const recordedErrors: unknown[] = [];

  return {
    recordedArchives,
    recordedConfirmInputs,
    recordedErrors,
    setSubagent(id, snapshot) {
      subagents.set(id, snapshot);
    },
    deps: {
      getSubagent: (id) => subagents.get(id),
      confirm: async (dialog) => {
        recordedConfirmInputs.push(dialog);
        return options.confirmResult ?? false;
      },
      archiveAgent: async (input) => {
        recordedArchives.push(input);
      },
      reportError: (error) => {
        recordedErrors.push(error);
      },
      t: i18n.t,
    },
  };
}

// The real instance, so a dialog that names a key nobody added renders as that key and fails.
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init();
  }
  await i18n.changeLanguage("en");
});

describe("resolveArchiveSubagentDialog", () => {
  it("uses running copy for running subagents", () => {
    expect(
      resolveArchiveSubagentDialog(i18n.t, {
        title: "Review branch",
        status: "running",
      }),
    ).toEqual({
      title: "Archive running subagent?",
      message:
        "Review branch is still running. Archiving it will stop the subagent and remove it from the track.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });

  it("does not use running copy for initializing subagents", () => {
    expect(
      resolveArchiveSubagentDialog(i18n.t, {
        title: "Starting child",
        status: "initializing",
      }),
    ).toEqual({
      title: "Archive subagent?",
      message: "Remove Starting child from the track. The subagent will be archived.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });

  it("uses idle copy for non-running subagents", () => {
    expect(
      resolveArchiveSubagentDialog(i18n.t, {
        title: "Review branch",
        status: "idle",
      }),
    ).toEqual({
      title: "Archive subagent?",
      message: "Remove Review branch from the track. The subagent will be archived.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });

  it("falls back to this subagent when the title is not displayable", () => {
    expect(
      resolveArchiveSubagentDialog(i18n.t, {
        title: "New Agent",
        status: null,
      }),
    ).toEqual({
      title: "Archive subagent?",
      message: "Remove this subagent from the track. The subagent will be archived.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });

  it("falls back to this subagent in the running copy when the title is not displayable", () => {
    expect(
      resolveArchiveSubagentDialog(i18n.t, {
        title: "  ",
        status: "running",
      }),
    ).toEqual({
      title: "Archive running subagent?",
      message:
        "this subagent is still running. Archiving it will stop the subagent and remove it from the track.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });
});

describe("requestArchiveSubagent", () => {
  it("archives the subagent with the server id when the user confirms", async () => {
    const env = createFakeEnv({
      confirmResult: true,
      initialSubagents: [
        {
          id: "child-agent",
          snapshot: { title: "Review branch", status: "running" },
        },
      ],
    });

    await requestArchiveSubagent({ serverId: "server-1", subagentId: "child-agent" }, env.deps);

    expect(env.recordedArchives).toEqual([{ serverId: "server-1", agentId: "child-agent" }]);
  });

  it("does not archive the subagent when the user cancels", async () => {
    const env = createFakeEnv({
      confirmResult: false,
      initialSubagents: [
        {
          id: "child-agent",
          snapshot: { title: "Review branch", status: "idle" },
        },
      ],
    });

    await requestArchiveSubagent({ serverId: "server-1", subagentId: "child-agent" }, env.deps);

    expect(env.recordedArchives).toEqual([]);
  });

  it("asks for confirmation using the resolved dialog for the subagent", async () => {
    const env = createFakeEnv({
      confirmResult: false,
      initialSubagents: [
        {
          id: "child-agent",
          snapshot: { title: "Review branch", status: "running" },
        },
      ],
    });

    await requestArchiveSubagent({ serverId: "server-1", subagentId: "child-agent" }, env.deps);

    expect(env.recordedConfirmInputs).toEqual([
      resolveArchiveSubagentDialog(i18n.t, { title: "Review branch", status: "running" }),
    ]);
  });

  it("asks with the missing-subagent dialog when the snapshot is unknown", async () => {
    const env = createFakeEnv({ confirmResult: false });

    await requestArchiveSubagent({ serverId: "server-1", subagentId: "missing" }, env.deps);

    expect(env.recordedConfirmInputs).toEqual([
      resolveArchiveSubagentDialog(i18n.t, { title: undefined, status: undefined }),
    ]);
    expect(env.recordedArchives).toEqual([]);
  });

  it("reports archive errors after the user confirms", async () => {
    const env = createFakeEnv({
      confirmResult: true,
      initialSubagents: [
        {
          id: "child-agent",
          snapshot: { title: "Review branch", status: "running" },
        },
      ],
    });
    const error = new Error("daemon offline");
    env.deps.archiveAgent = async () => {
      throw error;
    };

    await expect(
      requestArchiveSubagent({ serverId: "server-1", subagentId: "child-agent" }, env.deps),
    ).resolves.toBeUndefined();
    expect(env.recordedErrors).toEqual([error]);
  });
});
