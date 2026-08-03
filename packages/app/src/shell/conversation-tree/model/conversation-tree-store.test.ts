import {
  WorkspaceDescriptorPayloadSchema,
  type WorkspaceDescriptorPayload,
} from "@getpaseo/protocol/messages";
import { describe, expect, test } from "vitest";
import type {
  ConversationTreeData,
  ConversationTreeWorkspaceSnapshot,
  FetchConversationTreeAgentsInput,
} from "../data/conversation-tree-data";
import type { AgentUpdateEvent } from "./apply-agent-update";
import { ConversationTreeStore, type ConversationTreeStoreDeps } from "./conversation-tree-store";
import type { ConversationTreeAgent, ConversationTreePinTarget } from "./types";

/** Build a complete model agent while keeping each store test focused on its transition. */
function agent(id: string, overrides: Partial<ConversationTreeAgent> = {}): ConversationTreeAgent {
  return {
    id,
    provider: "claude",
    title: `Agent ${id}`,
    workspaceId: null,
    parentAgentId: null,
    status: "idle",
    requiresAttention: false,
    attentionReason: null,
    pendingPermissionCount: 0,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    sessionId: null,
    ...overrides,
  };
}

/** Parse a protocol workspace that drives both project grouping and live title metadata. */
function workspace(
  id: string,
  overrides: Partial<WorkspaceDescriptorPayload> = {},
): WorkspaceDescriptorPayload {
  return WorkspaceDescriptorPayloadSchema.parse({
    id,
    projectId: "project",
    projectDisplayName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: `/repo/project/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: `Workspace ${id}`,
    title: null,
    status: "done",
    activityAt: null,
    scripts: [],
    ...overrides,
  });
}

/** A typed in-memory data adapter with controllable fetch and write settlement. */
class FakeConversationTreeData implements ConversationTreeData {
  agents: readonly ConversationTreeAgent[] = [];
  workspaceSnapshot: ConversationTreeWorkspaceSnapshot = { workspaces: [], emptyProjects: [] };
  fetchError: Error | null = null;
  renameError: Error | null = null;
  removeError: Error | null = null;
  renameProjectResult: Promise<string> | null = null;
  removeProjectResult: Promise<void> | null = null;
  readonly startedFetches: string[] = [];
  readonly agentHandlers = new Set<(event: AgentUpdateEvent) => void>();
  readonly workspaceHandlers = new Set<(entry: WorkspaceDescriptorPayload) => void>();
  readonly renameProjectCalls: Array<{ projectKey: string; name: string }> = [];
  readonly renameConversationCalls: Array<{ workspaceId: string; title: string }> = [];
  readonly removeProjectCalls: string[] = [];
  agentUnsubscribeCount = 0;
  workspaceUnsubscribeCount = 0;

  /** Return the scripted agent directory or its current fetch failure. */
  async fetchAgents(
    _input: FetchConversationTreeAgentsInput,
  ): Promise<readonly ConversationTreeAgent[]> {
    this.startedFetches.push("agents");
    if (this.fetchError !== null) {
      throw this.fetchError;
    }
    return this.agents;
  }

  /** Return the scripted workspace directory or its current fetch failure. */
  async fetchWorkspaces(): Promise<ConversationTreeWorkspaceSnapshot> {
    this.startedFetches.push("workspaces");
    if (this.fetchError !== null) {
      throw this.fetchError;
    }
    return this.workspaceSnapshot;
  }

  /** Register one agent stream listener with an idempotent local disposer. */
  onAgentUpdate(handler: (event: AgentUpdateEvent) => void): () => void {
    this.agentHandlers.add(handler);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      this.agentHandlers.delete(handler);
      this.agentUnsubscribeCount += 1;
    };
  }

  /** Register one workspace stream listener with an idempotent local disposer. */
  onWorkspaceUpdate(handler: (entry: WorkspaceDescriptorPayload) => void): () => void {
    this.workspaceHandlers.add(handler);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      this.workspaceHandlers.delete(handler);
      this.workspaceUnsubscribeCount += 1;
    };
  }

  /** Settle a project rename through a scripted error, gate, or accepted name. */
  async renameProject(projectKey: string, name: string): Promise<string> {
    this.renameProjectCalls.push({ projectKey, name });
    if (this.renameError !== null) {
      throw this.renameError;
    }
    if (this.renameProjectResult !== null) {
      return await this.renameProjectResult;
    }
    return name;
  }

  /** Settle a conversation rename through the same scripted rename failure. */
  async renameConversation(workspaceId: string, title: string): Promise<void> {
    this.renameConversationCalls.push({ workspaceId, title });
    if (this.renameError !== null) {
      throw this.renameError;
    }
  }

  /** Settle a project removal through a scripted error or gate. */
  async removeProject(projectKey: string): Promise<void> {
    this.removeProjectCalls.push(projectKey);
    if (this.removeError !== null) {
      throw this.removeError;
    }
    if (this.removeProjectResult !== null) {
      await this.removeProjectResult;
    }
  }

  /** Emit one agent event to the store's live subscription. */
  emitAgent(event: AgentUpdateEvent): void {
    for (const handler of this.agentHandlers) {
      handler(event);
    }
  }

  /** Emit one workspace descriptor to the store's live subscription. */
  emitWorkspace(entry: WorkspaceDescriptorPayload): void {
    for (const handler of this.workspaceHandlers) {
      handler(entry);
    }
  }
}

interface StoreHarness {
  readonly store: ConversationTreeStore;
  readonly errors: ConversationTreeStoreDeps["reportError"] extends (input: infer Input) => void
    ? Input[]
    : never;
  readonly navigated: string[];
  readonly copied: string[];
  readonly revealed: string[];
  readonly openedWindows: string[];
  readonly context: { serverId: string; isElectron: boolean; isOffline: boolean };
  readonly getRightOpenCount: () => number;
  readonly rightPanelRequests: Array<{
    agentId: string;
    workspaceId: string;
    title: string;
    readOnly: boolean;
  }>;
  readonly getSearchOpenCount: () => number;
  readonly retargetedConversationViews: Array<{ draftId: string; agentId: string }>;
}

/** Wire the store over explicit side-effect ports and retain their observable call history. */
function createStoreHarness(data: FakeConversationTreeData): StoreHarness {
  const errors: StoreHarness["errors"] = [];
  const navigated: string[] = [];
  const copied: string[] = [];
  const revealed: string[] = [];
  const openedWindows: string[] = [];
  const context = { serverId: "server", isElectron: true, isOffline: false };
  let rightOpenCount = 0;
  const rightPanelRequests: StoreHarness["rightPanelRequests"] = [];
  let searchOpenCount = 0;
  let draftCount = 0;
  const retargetedConversationViews: StoreHarness["retargetedConversationViews"] = [];
  const store = new ConversationTreeStore({
    data,
    openConversationInRightPanel: (input) => {
      rightOpenCount += 1;
      rightPanelRequests.push(input);
    },
    navigate: (route) => navigated.push(route),
    openInFinder: async (path) => {
      revealed.push(path);
    },
    openInNewWindow: (path) => openedWindows.push(path),
    copyToClipboard: (text) => copied.push(text),
    confirmDestructive: async () => true,
    reportError: (input) => errors.push(input),
    openSearch: () => {
      searchOpenCount += 1;
    },
    createDraftId: () => `draft-${++draftCount}`,
    retargetConversationView: (input) => retargetedConversationViews.push(input),
    getContext: () => context,
  });
  return {
    store,
    errors,
    navigated,
    copied,
    revealed,
    openedWindows,
    context,
    getRightOpenCount: () => rightOpenCount,
    rightPanelRequests,
    getSearchOpenCount: () => searchOpenCount,
    retargetedConversationViews,
  };
}

/** Return the first root conversation from a loaded one-project tree. */
function firstConversation(store: ConversationTreeStore) {
  const projectNode = store.tree[0];
  if (projectNode?.kind !== "project") {
    throw new Error("Expected a project root");
  }
  const root = projectNode.children[0];
  if (root === undefined) {
    throw new Error("Expected a root conversation");
  }
  return root;
}

describe("ConversationTreeStore", () => {
  test("loads agents and workspaces in parallel without letting workspace titles replace agent titles", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("root", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    const { store } = createStoreHarness(data);

    const loading = store.load();
    expect(data.startedFetches).toEqual(["agents", "workspaces"]);
    await loading;

    expect(store.panelState).toBe("ready");
    expect(firstConversation(store).title).toBe("Agent root");

    data.emitWorkspace(workspace("workspace-root", { name: "Renamed live" }));
    expect(firstConversation(store).title).toBe("Agent root");
  });

  test("opens a new conversation draft after the initial workspace load", async () => {
    const data = new FakeConversationTreeData();
    data.workspaceSnapshot = {
      workspaces: [workspace("workspace-root", { workspaceKind: "directory" })],
      emptyProjects: [],
    };
    const { store } = createStoreHarness(data);

    await store.load();

    expect(store.draftTarget).toEqual({
      draftId: "draft-1",
      workspaceId: null,
    });
    expect(store.focusedRootId).toBeNull();
    expect(store.activeNodeId).toBeNull();
  });

  test("keeps every explicit center target across a later directory reload", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("root", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = {
      workspaces: [workspace("workspace-root", { workspaceKind: "directory" })],
      emptyProjects: [],
    };

    const selected = createStoreHarness(data);
    await selected.store.load();
    selected.store.activateNode(firstConversation(selected.store));
    await selected.store.load();
    expect(selected.store.focusedRootId).toBe("root");
    expect(selected.store.draftTarget).toBeNull();

    const drafted = createStoreHarness(data);
    await drafted.store.load();
    drafted.store.openNewConversation();
    const explicitDraft = drafted.store.draftTarget;
    await drafted.store.load();
    expect(drafted.store.draftTarget).toEqual(explicitDraft);

    const pending = createStoreHarness(data);
    await pending.store.load();
    pending.store.bindDraftWorkspace(workspace("workspace-root", { workspaceKind: "directory" }));
    pending.store.completeDraft("created-agent");
    await pending.store.load();
    expect(pending.store.pendingAgentTarget).toEqual({
      agentId: "created-agent",
      workspaceId: "workspace-root",
    });
    expect(pending.store.focusedRootId).toBe("created-agent");
    expect(pending.store.draftTarget).toBeNull();
  });

  test("applies agent upserts and project placement without rebuilding subscriptions", async () => {
    const data = new FakeConversationTreeData();
    const { store } = createStoreHarness(data);
    await store.load();
    const pushed = agent("pushed", { workspaceId: "workspace-pushed", status: "running" });

    data.emitAgent({
      kind: "upsert",
      agent: pushed,
      project: { projectKey: "new-project", projectName: "New project" },
    });

    expect(store.agents.get("pushed")).toBe(pushed);
    expect(store.projects.get("new-project")?.workspaceIds).toEqual(["workspace-pushed"]);
    expect(store.tree[0]).toMatchObject({ id: "new-project", kind: "project" });
    expect(data.agentHandlers.size).toBe(1);
    expect(data.workspaceHandlers.size).toBe(1);
  });

  test("clears only the focus pointing at a removed root; its promoted descendants stay selected", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [
      agent("root", { workspaceId: "workspace-root" }),
      agent("child", { parentAgentId: "root", workspaceId: "workspace-child" }),
      agent("grandchild", {
        parentAgentId: "child",
        workspaceId: "workspace-grandchild",
      }),
    ];
    data.workspaceSnapshot = {
      workspaces: [workspace("workspace-root"), workspace("workspace-grandchild")],
      emptyProjects: [],
    };
    const { store } = createStoreHarness(data);
    await store.load();
    const root = firstConversation(store);
    const child = root.children[0];
    if (child === undefined) {
      throw new Error("Expected child node");
    }
    store.activateNode(root);
    store.activateNode(child);
    store.beginRename("conversation", "grandchild");

    data.emitAgent({ kind: "remove", agentId: "root" });

    // "child" and "grandchild" lost their only ancestor, not themselves — build-tree now
    // promotes "child" to its own root, so both stay visible and their selection survives.
    // Only focusedRootId, which pointed at the exact removed id, falls back to null.
    expect(store.editing).not.toBeNull();
    expect(store.activeNodeId).toBe("child");
    expect(store.focusedRootId).toBeNull();
  });

  test("clears editing, active, and focused identities when the selected node itself is removed", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("root", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = {
      workspaces: [workspace("workspace-root")],
      emptyProjects: [],
    };
    const { store } = createStoreHarness(data);
    await store.load();
    const root = firstConversation(store);
    store.activateNode(root);
    store.beginRename("conversation", "root");

    data.emitAgent({ kind: "remove", agentId: "root" });

    expect(store.editing).toBeNull();
    expect(store.activeNodeId).toBeNull();
    expect(store.focusedRootId).toBeNull();
  });

  test("keeps the local rename draft across same-node agent and workspace updates", async () => {
    const data = new FakeConversationTreeData();
    const root = agent("root", { workspaceId: "workspace-root" });
    data.agents = [root];
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    const { store } = createStoreHarness(data);
    await store.load();
    store.beginRename("conversation", "root");
    store.setDraftName("My pending draft");

    data.emitAgent({
      kind: "upsert",
      agent: { ...root, title: "Remote agent title" },
      project: { projectKey: "project", projectName: "Project" },
    });
    data.emitWorkspace(workspace("workspace-root", { name: "Remote workspace title" }));

    expect(store.editing?.draftName).toBe("My pending draft");
  });

  test("keeps project editing isolated from an unrelated agent with the same string id", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("project", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    const { store } = createStoreHarness(data);
    await store.load();
    store.beginRename("project", "project");
    store.setDraftName("Project draft");

    data.emitAgent({ kind: "remove", agentId: "project" });

    expect(store.editing?.kind).toBe("project");
    expect(store.editing?.draftName).toBe("Project draft");
  });

  test("activates roots in the center model and subagents in the right panel without navigating", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [
      agent("root", { workspaceId: "workspace-root" }),
      agent("child", { parentAgentId: "root" }),
    ];
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    const harness = createStoreHarness(data);
    await harness.store.load();
    const root = firstConversation(harness.store);
    const child = root.children[0];
    if (child === undefined) {
      throw new Error("Expected child node");
    }

    harness.store.activateNode(root);
    harness.store.activateNode(child);

    expect(harness.store.focusedRootId).toBe("root");
    expect(harness.store.activeNodeId).toBe("child");
    expect(harness.store.isRowSelected(root)).toBe(true);
    expect(harness.store.isRowSelected(child)).toBe(true);
    expect(harness.getRightOpenCount()).toBe(1);
    expect(harness.rightPanelRequests).toEqual([
      {
        agentId: "child",
        workspaceId: "workspace-root",
        title: "Agent child",
        readOnly: true,
      },
    ]);
    expect(harness.navigated).toEqual([]);
  });

  test("opens global and project drafts inline while keeping worktree and picker navigation", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("root", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = {
      workspaces: [
        workspace("workspace-root", { workspaceKind: "directory" }),
        workspace("workspace-other", {
          projectId: "other",
          workspaceKind: "directory",
          workspaceDirectory: "/repo/other",
        }),
      ],
      emptyProjects: [],
    };
    const harness = createStoreHarness(data);
    await harness.store.load();

    harness.store.activateNode(firstConversation(harness.store));
    expect(harness.store.resolveNewConversationWorkspaceId()).toBe("workspace-root");
    harness.store.openNewConversation();
    expect(harness.store.draftTarget).toEqual({
      draftId: "draft-2",
      workspaceId: null,
    });
    expect(harness.store.resolveNewConversationWorkspaceId()).toBeNull();
    expect(harness.store.focusedRootId).toBeNull();
    expect(harness.store.activeNodeId).toBeNull();

    harness.store.openProjectConversation("workspace-other");
    expect(harness.store.draftTarget).toEqual({
      draftId: "draft-3",
      workspaceId: "workspace-other",
    });

    harness.store.openProjectConversation(null);
    expect(harness.store.draftTarget).toEqual({ draftId: "draft-4", workspaceId: null });

    const selectedWorkspace = workspace("workspace-other", {
      projectId: "other",
      workspaceKind: "directory",
      workspaceDirectory: "/repo/other",
    });
    harness.store.bindDraftWorkspace(selectedWorkspace);
    expect(harness.store.draftTarget).toEqual({
      draftId: "draft-4",
      workspaceId: "workspace-other",
    });
    expect(harness.store.workspaceDetails.get("workspace-other")?.directory).toBe("/repo/other");

    harness.store.openProjectWorktree({
      sourceDirectory: "/repo/project",
      projectKey: "project",
      projectName: "Project",
    });
    harness.store.openProjectPicker();

    expect(harness.navigated).toEqual([
      "/h/server/new?dir=%2Frepo%2Fproject&name=Project&projectId=project",
      "/h/server/open-project",
    ]);

    harness.context.isOffline = true;
    harness.store.openNewConversation();
    expect(harness.store.draftTarget?.draftId).toBe("draft-4");
    expect(harness.navigated).toHaveLength(2);
  });

  test("keeps an inline unavailable draft when no workspace exists", () => {
    const harness = createStoreHarness(new FakeConversationTreeData());

    expect(harness.store.resolveNewConversationWorkspaceId()).toBeNull();
    harness.store.openNewConversation();

    expect(harness.store.draftTarget).toEqual({ draftId: "draft-1", workspaceId: null });
    expect(harness.navigated).toEqual([]);
  });

  test("retargets a completed draft before the daemon upsert and releases the bridge afterward", async () => {
    const data = new FakeConversationTreeData();
    data.workspaceSnapshot = {
      workspaces: [workspace("workspace-root", { workspaceKind: "directory" })],
      emptyProjects: [],
    };
    const harness = createStoreHarness(data);
    await harness.store.load();
    harness.store.openNewConversation();
    harness.store.bindDraftWorkspace(workspace("workspace-root", { workspaceKind: "directory" }));

    harness.store.completeDraft("created-agent");

    expect(harness.store.draftTarget).toBeNull();
    expect(harness.store.pendingAgentTarget).toEqual({
      agentId: "created-agent",
      workspaceId: "workspace-root",
    });
    expect(harness.store.focusedRootId).toBe("created-agent");
    expect(harness.store.activeNodeId).toBe("created-agent");
    expect(harness.retargetedConversationViews).toEqual([
      { draftId: "draft-2", agentId: "created-agent" },
    ]);

    data.emitAgent({
      kind: "upsert",
      agent: agent("created-agent", { workspaceId: "workspace-root" }),
      project: { projectKey: "project", projectName: "Project" },
    });
    expect(harness.store.pendingAgentTarget).toBeNull();
  });

  test("keeps a completed conversation-only draft mounted without workspace ownership", async () => {
    const data = new FakeConversationTreeData();
    const harness = createStoreHarness(data);
    await harness.store.load();
    harness.store.openNewConversation();

    harness.store.completeDraft("conversation-only-agent");

    expect(harness.store.draftTarget).toBeNull();
    expect(harness.store.pendingAgentTarget).toEqual({
      agentId: "conversation-only-agent",
      workspaceId: null,
    });
    expect(harness.store.focusedRootId).toBe("conversation-only-agent");
    expect(harness.retargetedConversationViews).toEqual([
      { draftId: "draft-2", agentId: "conversation-only-agent" },
    ]);

    data.emitAgent({
      kind: "upsert",
      agent: agent("conversation-only-agent"),
      project: null,
    });
    expect(harness.store.pendingAgentTarget).toBeNull();
  });

  test("dispose unsubscribes both streams exactly once and blocks later fake events", () => {
    const data = new FakeConversationTreeData();
    const { store } = createStoreHarness(data);
    store.dispose();
    store.dispose();

    data.emitAgent({ kind: "upsert", agent: agent("late"), project: null });
    data.emitWorkspace(workspace("late"));

    expect(data.agentUnsubscribeCount).toBe(1);
    expect(data.workspaceUnsubscribeCount).toBe(1);
    expect(store.agents.size).toBe(0);
    expect(store.workspaceDetails.size).toBe(0);
  });

  test("keeps project rename non-optimistic and patches only after RPC success", async () => {
    const data = new FakeConversationTreeData();
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    let acceptRename = (_name: string): void => {};
    data.renameProjectResult = new Promise((resolve) => {
      acceptRename = resolve;
    });
    const { store } = createStoreHarness(data);
    await store.load();
    store.beginRename("project", "project");
    store.setDraftName("Renamed project");

    const committing = store.commitRename();
    expect(store.projects.get("project")?.name).toBe("Project");
    expect(store.editing?.draftName).toBe("Renamed project");
    acceptRename("Renamed project");
    await committing;

    expect(store.projects.get("project")?.name).toBe("Renamed project");
    expect(store.editing).toBeNull();
  });

  test("reports rename rejection and preserves both the editing draft and project row", async () => {
    const data = new FakeConversationTreeData();
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    data.renameError = new Error("rename rejected");
    const { store, errors } = createStoreHarness(data);
    await store.load();
    store.beginRename("project", "project");
    store.setDraftName("Keep this draft");

    await store.commitRename();

    expect(store.editing?.draftName).toBe("Keep this draft");
    expect(store.projects.get("project")?.name).toBe("Project");
    expect(errors).toEqual([{ action: "rename", message: "rename rejected" }]);
  });

  test("preserves conversation editing when the workspace-title RPC rejects", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [agent("root", { workspaceId: "workspace-root" })];
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    data.renameError = new Error("workspace rename rejected");
    const { store, errors } = createStoreHarness(data);
    await store.load();
    store.beginRename("conversation", "root");
    store.setDraftName("Keep conversation draft");

    await store.commitRename();

    expect(store.editing?.draftName).toBe("Keep conversation draft");
    expect(data.renameConversationCalls).toEqual([
      { workspaceId: "workspace-root", title: "Keep conversation draft" },
    ]);
    expect(errors).toEqual([{ action: "rename", message: "workspace rename rejected" }]);
  });

  test("toggles shared project/workspace pins locally and blocks pin writes offline", () => {
    const data = new FakeConversationTreeData();
    const harness = createStoreHarness(data);
    const projectPin: ConversationTreePinTarget = { kind: "project", projectKey: "project" };
    const workspacePin: ConversationTreePinTarget = {
      kind: "workspace",
      workspaceId: "workspace",
    };

    harness.store.togglePin(projectPin);
    harness.store.togglePin(workspacePin);
    expect(harness.store.pins).toEqual([projectPin, workspacePin]);
    expect(harness.store.isPinned(projectPin)).toBe(true);

    harness.context.isOffline = true;
    harness.store.togglePin(projectPin);
    expect(harness.store.pins).toEqual([projectPin, workspacePin]);
  });

  test("keeps project removal non-optimistic and leaves the row in place on rejection", async () => {
    const data = new FakeConversationTreeData();
    data.workspaceSnapshot = { workspaces: [workspace("workspace-root")], emptyProjects: [] };
    let acceptRemoval = (): void => {};
    data.removeProjectResult = new Promise((resolve) => {
      acceptRemoval = resolve;
    });
    const successHarness = createStoreHarness(data);
    await successHarness.store.load();

    const removing = successHarness.store.requestRemoveProject("project");
    await Promise.resolve();
    expect(successHarness.store.projects.has("project")).toBe(true);
    acceptRemoval();
    await removing;
    expect(successHarness.store.projects.has("project")).toBe(false);

    const rejectedData = new FakeConversationTreeData();
    rejectedData.workspaceSnapshot = {
      workspaces: [workspace("workspace-root")],
      emptyProjects: [],
    };
    rejectedData.removeError = new Error("remove rejected");
    const rejectedHarness = createStoreHarness(rejectedData);
    await rejectedHarness.store.load();
    await rejectedHarness.store.requestRemoveProject("project");

    expect(rejectedHarness.store.projects.has("project")).toBe(true);
    expect(rejectedHarness.errors).toEqual([{ action: "remove", message: "remove rejected" }]);
  });

  test("derives error before loading, then empty and ready panel states across retries", async () => {
    const data = new FakeConversationTreeData();
    data.fetchError = new Error("load failed");
    const { store } = createStoreHarness(data);
    expect(store.panelState).toBe("loading");

    await store.load();
    expect(store.panelState).toBe("error");

    data.fetchError = null;
    await store.load();
    expect(store.panelState).toBe("empty");

    data.agents = [agent("loose")];
    await store.load();
    expect(store.panelState).toBe("ready");
  });

  test("filters archived records but keeps closed agents from the initial active snapshot", async () => {
    const data = new FakeConversationTreeData();
    data.agents = [
      agent("archived", { archivedAt: "2026-07-12T02:00:00.000Z" }),
      agent("closed", { status: "closed" }),
    ];
    const { store } = createStoreHarness(data);

    await store.load();

    expect(Array.from(store.agents.keys())).toEqual(["closed"]);
    expect(store.panelState).toBe("ready");
  });
});
