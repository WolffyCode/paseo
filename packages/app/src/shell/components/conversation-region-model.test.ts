import { describe, expect, it } from "vitest";
import type { ConversationTreeAgent, WorkspaceDetail } from "../conversation-tree/model/types";
import {
  absoluteHostPath,
  resolveConversationRegionTarget,
  resolveFocusedConversation,
} from "./conversation-region-model";

const AGENT: ConversationTreeAgent = {
  id: "agent-1",
  provider: "codex",
  title: "Imported conversation",
  workspaceId: "workspace-1",
  parentAgentId: null,
  status: "idle",
  requiresAttention: false,
  attentionReason: null,
  pendingPermissionCount: 0,
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T01:00:00.000Z",
  sessionId: "session-1",
};

const WORKSPACE: WorkspaceDetail = {
  projectId: "project-1",
  workspaceKind: "directory",
  title: "Helm",
  directory: "/repo/helm",
  branch: "feat/conversation-tree-design",
  lastChangeAt: null,
  diffStat: null,
};

describe("resolveFocusedConversation", () => {
  it("resolves the selected root agent and workspace directory", () => {
    expect(
      resolveFocusedConversation({
        focusedRootId: AGENT.id,
        agents: new Map([[AGENT.id, AGENT]]),
        workspaceDetails: new Map([[AGENT.workspaceId!, WORKSPACE]]),
      }),
    ).toEqual({
      agentId: AGENT.id,
      workspaceId: AGENT.workspaceId,
      workspaceRoot: WORKSPACE.directory,
    });
  });

  it("returns null until a root with workspace ownership is selected", () => {
    expect(
      resolveFocusedConversation({
        focusedRootId: null,
        agents: new Map([[AGENT.id, AGENT]]),
        workspaceDetails: new Map(),
      }),
    ).toBeNull();
    expect(
      resolveFocusedConversation({
        focusedRootId: "missing-agent",
        agents: new Map([[AGENT.id, AGENT]]),
        workspaceDetails: new Map(),
      }),
    ).toBeNull();
  });
});

describe("absoluteHostPath", () => {
  it("anchors relative links and preserves Unix, home, and Windows absolute paths", () => {
    expect(absoluteHostPath("/repo/helm/", "src\\app.tsx")).toBe("/repo/helm/src/app.tsx");
    expect(absoluteHostPath("/repo/helm", "/tmp/output.txt")).toBe("/tmp/output.txt");
    expect(absoluteHostPath("/repo/helm", "~/notes.md")).toBe("~/notes.md");
    expect(absoluteHostPath("C:/repo/helm", "D:\\logs\\out.txt")).toBe("D:/logs/out.txt");
  });
});

describe("resolveConversationRegionTarget", () => {
  it("gives an inline draft precedence over the previously focused conversation", () => {
    expect(
      resolveConversationRegionTarget({
        focusedRootId: AGENT.id,
        draftTarget: { draftId: "draft-1", workspaceId: AGENT.workspaceId },
        pendingAgentTarget: null,
        agents: new Map([[AGENT.id, AGENT]]),
        workspaceDetails: new Map([[AGENT.workspaceId!, WORKSPACE]]),
      }),
    ).toEqual({
      kind: "draft",
      draftId: "draft-1",
      workspaceId: AGENT.workspaceId,
      workspaceRoot: WORKSPACE.directory,
    });
  });

  it("keeps the created agent mounted before its directory upsert and models unbound drafts", () => {
    expect(
      resolveConversationRegionTarget({
        focusedRootId: "created",
        draftTarget: null,
        pendingAgentTarget: { agentId: "created", workspaceId: AGENT.workspaceId! },
        agents: new Map(),
        workspaceDetails: new Map([[AGENT.workspaceId!, WORKSPACE]]),
      }),
    ).toEqual({
      kind: "agent",
      agentId: "created",
      workspaceId: AGENT.workspaceId,
      workspaceRoot: WORKSPACE.directory,
    });
    expect(
      resolveConversationRegionTarget({
        focusedRootId: null,
        draftTarget: { draftId: "draft-empty", workspaceId: null },
        pendingAgentTarget: null,
        agents: new Map(),
        workspaceDetails: new Map(),
      }),
    ).toEqual({
      kind: "draft",
      draftId: "draft-empty",
      workspaceId: null,
      workspaceRoot: "",
    });
  });
});
