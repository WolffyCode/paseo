import { describe, expect, test } from "vitest";
import type { ConversationTreeSubagentNode, WorkspaceDetail } from "../model/types";
import { resolveHoverCardContent } from "./hover-card-content";

const PARENT_WORKSPACE: WorkspaceDetail = {
  projectId: "project",
  workspaceKind: "worktree",
  title: "Parent conversation",
  directory: "/repo/project/worktree",
  branch: "feat/conversation-tree-design",
  lastChangeAt: null,
  diffStat: null,
};

const SUBAGENT: ConversationTreeSubagentNode = {
  kind: "subagent",
  id: "child",
  title: "Child investigation",
  workspaceId: null,
  contextWorkspaceId: "parent-workspace",
  runStatus: "idle",
  updatedAt: "2026-07-12T00:30:00.000Z",
  providerId: "codex",
  subagentCount: 0,
  children: [],
};

describe("resolveHoverCardContent", () => {
  test("uses subagent metadata while inheriting only its directory context", () => {
    expect(
      resolveHoverCardContent(SUBAGENT, new Map([["parent-workspace", PARENT_WORKSPACE]])),
    ).toEqual({
      kind: "conversation",
      id: "child",
      title: "Child investigation",
      directory: "/repo/project/worktree",
      updatedAt: "2026-07-12T00:30:00.000Z",
      providerId: "codex",
    });
  });
});
