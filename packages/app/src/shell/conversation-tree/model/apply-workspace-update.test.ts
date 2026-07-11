import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import { describe, expect, test } from "vitest";
import { applyWorkspaceUpdate } from "./apply-workspace-update";
import type { WorkspaceDetail } from "./types";

/** Build a complete workspace payload with overridable title-card metadata. */
function workspace(
  id: string,
  overrides: Partial<WorkspaceDescriptorPayload> = {},
): WorkspaceDescriptorPayload {
  return {
    id,
    projectId: "/repo/project",
    projectDisplayName: "project",
    projectRootPath: "/repo/project",
    workspaceDirectory: `/repo/project/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: `Workspace ${id}`,
    title: null,
    archivingAt: null,
    status: "done",
    statusEnteredAt: null,
    activityAt: "2026-07-12T01:00:00.000Z",
    diffStat: { additions: 12, deletions: 4 },
    scripts: [],
    gitRuntime: {
      currentBranch: `feature/${id}`,
      remoteUrl: null,
      isPaseoOwnedWorktree: true,
      isDirty: true,
      aheadBehind: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
    },
    githubRuntime: null,
    ...overrides,
  };
}

describe("applyWorkspaceUpdate", () => {
  test("folds one protocol descriptor into the tree's title and hover-card detail shape", () => {
    const previous = new Map([
      [
        "kept",
        {
          title: "Kept",
          directory: "/kept",
          branch: null,
          lastChangeAt: null,
          diffStat: null,
        },
      ],
    ]);
    const next = applyWorkspaceUpdate(
      previous,
      workspace("workspace-1", { name: "Renamed conversation" }),
    );

    expect(next.get("workspace-1")).toEqual({
      title: "Renamed conversation",
      directory: "/repo/project/workspace-1",
      branch: "feature/workspace-1",
      lastChangeAt: "2026-07-12T01:00:00.000Z",
      diffStat: { added: 12, removed: 4 },
    });
    expect(next.get("kept")).toBe(previous.get("kept"));
  });

  test("normalizes absent optional metadata to explicit null fields", () => {
    const next = applyWorkspaceUpdate(
      new Map(),
      workspace("workspace-1", {
        name: "   ",
        activityAt: null,
        diffStat: null,
        gitRuntime: null,
      }),
    );

    expect(next.get("workspace-1")).toEqual({
      title: null,
      directory: "/repo/project/workspace-1",
      branch: null,
      lastChangeAt: null,
      diffStat: null,
    });
  });

  test("produces the same snapshot when initial batches and live updates use the same fold", () => {
    const first = workspace("first");
    const second = workspace("second");
    let initial: ReadonlyMap<string, WorkspaceDetail> = new Map();
    for (const descriptor of [first, second]) {
      initial = applyWorkspaceUpdate(initial, descriptor);
    }

    const incrementallyUpdated = applyWorkspaceUpdate(
      applyWorkspaceUpdate(new Map(), first),
      second,
    );

    expect(initial).toEqual(incrementallyUpdated);
  });
});
