import { describe, expect, test } from "vitest";
import type { ConversationTreeAgent, WorkspaceDetail } from "./types";
import { resolveDefaultConversationWorkspace } from "./draft-workspace";

function detail(
  projectId: string,
  workspaceKind: WorkspaceDetail["workspaceKind"],
  directory: string,
): WorkspaceDetail {
  return {
    projectId,
    workspaceKind,
    title: null,
    directory,
    branch: null,
    lastChangeAt: null,
    diffStat: null,
  };
}

const FOCUSED_AGENT: ConversationTreeAgent = {
  id: "focused",
  provider: "codex",
  title: "Focused",
  workspaceId: "focused-workspace",
  parentAgentId: null,
  status: "idle",
  requiresAttention: false,
  attentionReason: null,
  pendingPermissionCount: 0,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  sessionId: null,
};

describe("resolveDefaultConversationWorkspace", () => {
  test("keeps a global draft in the currently focused workspace", () => {
    const result = resolveDefaultConversationWorkspace({
      focusedRootId: FOCUSED_AGENT.id,
      agents: new Map([[FOCUSED_AGENT.id, FOCUSED_AGENT]]),
      details: new Map([
        ["other", detail("other", "directory", "/a")],
        ["focused-workspace", detail("focused", "worktree", "/z")],
      ]),
    });

    expect(result?.workspaceId).toBe("focused-workspace");
  });

  test("prefers a stable local checkout and returns null without workspaces", () => {
    const details = new Map([
      ["worktree", detail("project", "worktree", "/a-worktree")],
      ["local-z", detail("project", "directory", "/z-local")],
      ["local-a", detail("project", "local_checkout", "/a-local")],
    ]);

    expect(
      resolveDefaultConversationWorkspace({
        focusedRootId: null,
        agents: new Map(),
        details,
      })?.workspaceId,
    ).toBe("local-a");
    expect(
      resolveDefaultConversationWorkspace({
        focusedRootId: null,
        agents: new Map(),
        details: new Map(),
      }),
    ).toBeNull();
  });
});
