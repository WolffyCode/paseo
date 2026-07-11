import type { DaemonClient, DaemonEvent } from "@getpaseo/client";
import {
  AgentSnapshotPayloadSchema,
  ProjectPlacementPayloadSchema,
  WorkspaceDescriptorPayloadSchema,
  WorkspaceProjectDescriptorPayloadSchema,
  type AgentSnapshotPayload,
  type WorkspaceDescriptorPayload,
} from "@getpaseo/protocol/messages";
import { describe, expect, test } from "vitest";
import type { AgentUpdateEvent } from "../model/apply-agent-update";
import {
  createConversationTreeData,
  type ConversationTreeRpcClient,
} from "./conversation-tree-data";

type FetchAgentsOptions = Exclude<Parameters<DaemonClient["fetchAgents"]>[0], undefined>;
type FetchAgentsResult = Awaited<ReturnType<DaemonClient["fetchAgents"]>>;
type FetchWorkspacesOptions = Exclude<Parameters<DaemonClient["fetchWorkspaces"]>[0], undefined>;
type FetchWorkspacesResult = Awaited<ReturnType<DaemonClient["fetchWorkspaces"]>>;

/** Parse a realistic protocol agent snapshot so the adapter test exercises the actual boundary shape. */
function agentSnapshot(
  id: string,
  overrides: Partial<AgentSnapshotPayload> = {},
): AgentSnapshotPayload {
  return AgentSnapshotPayloadSchema.parse({
    id,
    provider: "claude",
    cwd: "/repo",
    workspaceId: `workspace-${id}`,
    model: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    lastUserMessageAt: null,
    status: "idle",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: { provider: "claude", sessionId: `session-${id}` },
    title: `Agent ${id}`,
    labels: {},
    requiresAttention: false,
    attentionReason: null,
    archivedAt: null,
    ...overrides,
  });
}

/** Parse one project placement exactly as fetch_agents and agent_update carry it. */
function placement(projectKey: string) {
  return ProjectPlacementPayloadSchema.parse({
    projectKey,
    projectName: `Project ${projectKey}`,
    workspaceName: null,
    checkout: {
      cwd: `/repo/${projectKey}`,
      isGit: false,
      currentBranch: null,
      remoteUrl: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
    },
  });
}

/** Parse a realistic workspace descriptor for fetch and push paths. */
function workspace(id: string): WorkspaceDescriptorPayload {
  return WorkspaceDescriptorPayloadSchema.parse({
    id,
    projectId: `project-${id}`,
    projectDisplayName: `Project ${id}`,
    projectRootPath: `/repo/${id}`,
    workspaceDirectory: `/repo/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: `Workspace ${id}`,
    title: null,
    status: "done",
    activityAt: null,
    scripts: [],
  });
}

/** A typed in-memory adapter that records calls and emits real DaemonEvent values. */
class FakeConversationTreeRpcClient implements ConversationTreeRpcClient {
  readonly agentOptions: FetchAgentsOptions[] = [];
  readonly workspaceOptions: FetchWorkspacesOptions[] = [];
  readonly renameProjectCalls: Array<{ projectKey: string; name: string | null }> = [];
  readonly renameConversationCalls: Array<{ workspaceId: string; title: string | null }> = [];
  readonly removeProjectCalls: string[] = [];
  readonly listeners = new Set<(event: DaemonEvent) => void>();
  agentPages: FetchAgentsResult[] = [];
  workspacePages: FetchWorkspacesResult[] = [];

  /** Return scripted agent pages while retaining exact request options for assertions. */
  async fetchAgents(options?: FetchAgentsOptions): Promise<FetchAgentsResult> {
    this.agentOptions.push(options ?? {});
    const page = this.agentPages.shift();
    if (page === undefined) {
      throw new Error("No scripted agent page");
    }
    return page;
  }

  /** Return scripted workspace pages while retaining exact request options for assertions. */
  async fetchWorkspaces(options?: FetchWorkspacesOptions): Promise<FetchWorkspacesResult> {
    this.workspaceOptions.push(options ?? {});
    const page = this.workspacePages.shift();
    if (page === undefined) {
      throw new Error("No scripted workspace page");
    }
    return page;
  }

  /** Register a local daemon listener and return its real removal function. */
  subscribe(handler: (event: DaemonEvent) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /** Record project rename writes and echo the accepted custom name. */
  async renameProject(
    projectKey: string,
    name: string | null,
  ): Promise<{ customName: string | null }> {
    this.renameProjectCalls.push({ projectKey, name });
    return { customName: name };
  }

  /** Record project removals without mutating fake directory state. */
  async removeProject(projectKey: string): Promise<{ removedWorkspaceIds: string[] }> {
    this.removeProjectCalls.push(projectKey);
    return { removedWorkspaceIds: [] };
  }

  /** Record conversation title writes and echo the accepted title. */
  async setWorkspaceTitle(
    workspaceId: string,
    title: string | null,
  ): Promise<{ title: string | null }> {
    this.renameConversationCalls.push({ workspaceId, title });
    return { title };
  }

  /** Deliver one daemon event to every currently subscribed data-layer listener. */
  emit(event: DaemonEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Build a fetch_agents response page with deterministic pagination metadata. */
function agentPage(
  entries: FetchAgentsResult["entries"],
  nextCursor: string | null,
): FetchAgentsResult {
  return {
    requestId: "request-agents",
    subscriptionId: "subscription-agents",
    entries,
    pageInfo: { nextCursor, prevCursor: null, hasMore: nextCursor !== null },
  };
}

/** Build a fetch_workspaces response page with deterministic empty-project data. */
function workspacePage(
  entries: FetchWorkspacesResult["entries"],
  nextCursor: string | null,
  emptyProjects: FetchWorkspacesResult["emptyProjects"] = [],
): FetchWorkspacesResult {
  return {
    requestId: "request-workspaces",
    subscriptionId: "subscription-workspaces",
    entries,
    emptyProjects,
    pageInfo: { nextCursor, prevCursor: null, hasMore: nextCursor !== null },
  };
}

describe("createConversationTreeData", () => {
  test("fetches every active agent page and decodes the module-owned agent shape", async () => {
    const client = new FakeConversationTreeRpcClient();
    client.agentPages = [
      agentPage(
        [
          {
            agent: agentSnapshot("root", {
              workspaceId: " workspace-root ",
              labels: { "paseo.parent-agent-id": " parent " },
            }),
            project: placement("project-root"),
          },
        ],
        "agent-cursor",
      ),
      agentPage(
        [
          {
            agent: agentSnapshot("second", {
              runtimeInfo: { provider: "claude", sessionId: null },
              persistence: { provider: "claude", sessionId: "persisted-second" },
              pendingPermissions: [
                {
                  id: "permission-1",
                  provider: "claude",
                  name: "Write",
                  kind: "tool",
                },
              ],
            }),
            project: placement("project-second"),
          },
        ],
        null,
      ),
    ];
    const data = createConversationTreeData({
      client,
      subscriptionIdPrefix: "conversation-tree:test",
    });

    const agents = await data.fetchAgents({ includeArchived: false });

    expect(agents).toEqual([
      {
        id: "root",
        title: "Agent root",
        workspaceId: "workspace-root",
        parentAgentId: "parent",
        status: "idle",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 0,
        archivedAt: null,
        createdAt: "2026-07-12T00:00:00.000Z",
        sessionId: "session-root",
      },
      {
        id: "second",
        title: "Agent second",
        workspaceId: "workspace-second",
        parentAgentId: null,
        status: "idle",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissionCount: 1,
        archivedAt: null,
        createdAt: "2026-07-12T00:00:00.000Z",
        sessionId: "persisted-second",
      },
    ]);
    expect(client.agentOptions).toEqual([
      {
        scope: "active",
        page: { limit: 200 },
        subscribe: { subscriptionId: "conversation-tree:test:agents" },
      },
      { scope: "active", page: { limit: 200, cursor: "agent-cursor" } },
    ]);
  });

  test("fetches every workspace page and retains empty project parents", async () => {
    const client = new FakeConversationTreeRpcClient();
    const emptyProject = WorkspaceProjectDescriptorPayloadSchema.parse({
      projectId: "empty",
      projectDisplayName: "Empty",
      projectRootPath: "/repo/empty",
      projectKind: "git",
    });
    client.workspacePages = [
      workspacePage([workspace("first")], "workspace-cursor", [emptyProject]),
      workspacePage([workspace("second")], null),
    ];
    const data = createConversationTreeData({
      client,
      subscriptionIdPrefix: "conversation-tree:test",
    });

    const snapshot = await data.fetchWorkspaces();

    expect(snapshot.workspaces.map((entry) => entry.id)).toEqual(["first", "second"]);
    expect(snapshot.emptyProjects).toEqual([emptyProject]);
    expect(client.workspaceOptions).toEqual([
      {
        page: { limit: 200 },
        subscribe: { subscriptionId: "conversation-tree:test:workspaces" },
      },
      { page: { limit: 200, cursor: "workspace-cursor" } },
    ]);
  });

  test("decodes both live streams and each unsubscribe removes only its own listener", () => {
    const client = new FakeConversationTreeRpcClient();
    const data = createConversationTreeData({
      client,
      subscriptionIdPrefix: "conversation-tree:test",
    });
    const agentUpdates: AgentUpdateEvent[] = [];
    const workspaceUpdates: WorkspaceDescriptorPayload[] = [];
    const stopAgents = data.onAgentUpdate((event) => agentUpdates.push(event));
    const stopWorkspaces = data.onWorkspaceUpdate((entry) => workspaceUpdates.push(entry));
    const pushedAgent = agentSnapshot("pushed");
    const pushedWorkspace = workspace("pushed");

    client.emit({
      type: "agent_update",
      agentId: "pushed",
      payload: { kind: "upsert", agent: pushedAgent, project: placement("pushed-project") },
    });
    client.emit({
      type: "workspace_update",
      workspaceId: "pushed",
      payload: { kind: "upsert", workspace: pushedWorkspace },
    });
    expect(agentUpdates).toEqual([
      {
        kind: "upsert",
        agent: {
          id: "pushed",
          title: "Agent pushed",
          workspaceId: "workspace-pushed",
          parentAgentId: null,
          status: "idle",
          requiresAttention: false,
          attentionReason: null,
          pendingPermissionCount: 0,
          archivedAt: null,
          createdAt: "2026-07-12T00:00:00.000Z",
          sessionId: "session-pushed",
        },
        project: { projectKey: "pushed-project", projectName: "Project pushed-project" },
      },
    ]);
    expect(workspaceUpdates).toEqual([pushedWorkspace]);

    stopAgents();
    client.emit({
      type: "agent_update",
      agentId: "pushed",
      payload: { kind: "remove", agentId: "pushed" },
    });
    expect(agentUpdates).toHaveLength(1);
    expect(client.listeners.size).toBe(1);
    stopWorkspaces();
    expect(client.listeners.size).toBe(0);
  });

  test("decodes an upsert without project placement as project: null rather than a partial key", () => {
    const client = new FakeConversationTreeRpcClient();
    const data = createConversationTreeData({
      client,
      subscriptionIdPrefix: "conversation-tree:test",
    });
    const agentUpdates: AgentUpdateEvent[] = [];
    data.onAgentUpdate((event) => agentUpdates.push(event));

    client.emit({
      type: "agent_update",
      agentId: "unplaced",
      payload: { kind: "upsert", agent: agentSnapshot("unplaced") },
    });

    expect(agentUpdates).toHaveLength(1);
    expect(agentUpdates[0]).toMatchObject({ kind: "upsert", project: null });
  });

  test("delegates rename and remove writes through the injected client", async () => {
    const client = new FakeConversationTreeRpcClient();
    const data = createConversationTreeData({
      client,
      subscriptionIdPrefix: "conversation-tree:test",
    });

    await expect(data.renameProject("project", "Renamed")).resolves.toBe("Renamed");
    await data.renameConversation("workspace", "Conversation");
    await data.removeProject("project");

    expect(client.renameProjectCalls).toEqual([{ projectKey: "project", name: "Renamed" }]);
    expect(client.renameConversationCalls).toEqual([
      { workspaceId: "workspace", title: "Conversation" },
    ]);
    expect(client.removeProjectCalls).toEqual(["project"]);
  });
});
