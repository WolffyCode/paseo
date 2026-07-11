import { makeAutoObservable, observable, runInAction } from "mobx";
import type { WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import type { ConversationTreeData } from "../data/conversation-tree-data";
import {
  applyAgentUpdate,
  collectUnreachableAgentIds,
  type AgentUpdateEvent,
} from "./apply-agent-update";
import { applyWorkspaceUpdate } from "./apply-workspace-update";
import { buildConversationTree } from "./build-tree";
import { flattenTreeRows } from "./flatten-rows";
import { groupWorkspacesIntoProjects } from "./group-projects";
import { isPinned, togglePin } from "./pin-state";
import { partitionPinnedNodes, type PartitionPinnedNodesResult } from "./partition-pinned";
import {
  beginRename as beginRenameState,
  cancelRename as cancelRenameState,
  setRenameError,
  updateRenameDraft,
  validateRenameName,
} from "./rename-state";
import {
  buildNewConversationRoute,
  buildOpenProjectRoute,
  buildProjectConversationRoute,
  type ProjectConversationRouteInput,
} from "./routes";
import { isConversationTreeRowSelected } from "./selection-state";
import type {
  ConversationTreeAgent,
  ConversationTreeNode,
  ConversationTreePinTarget,
  ConversationTreeProject,
  ConversationTreeRow,
  Editing,
  SelectableConversationTreeNode,
  WorkspaceDetail,
} from "./types";

const MAX_RENDER_DEPTH = 64;

export interface ConversationTreeContext {
  readonly serverId: string;
  readonly isElectron: boolean;
  readonly isOffline: boolean;
}

export interface ConversationTreeStoreDeps {
  readonly data: ConversationTreeData;
  readonly openRightPanel: () => void;
  readonly navigate: (route: string) => void;
  readonly openInFinder: (absolutePath: string) => Promise<void>;
  readonly openInNewWindow: (absolutePath: string) => void;
  readonly copyToClipboard: (text: string) => void;
  readonly confirmDestructive: (input: { title: string; body: string }) => Promise<boolean>;
  readonly reportError: (input: { action: "rename" | "remove" | "pin"; message: string }) => void;
  readonly openSearch: () => void;
  readonly getContext: () => ConversationTreeContext;
}

export interface ConversationTreePreferences {
  readonly pins: readonly ConversationTreePinTarget[];
  readonly collapsedProjectKeys: ReadonlySet<string>;
}

export type ConversationTreePanelState = "loading" | "empty" | "error" | "ready";

export class ConversationTreeStore {
  agents: ReadonlyMap<string, ConversationTreeAgent> = new Map();
  projects: ReadonlyMap<string, ConversationTreeProject> = new Map();
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail> = new Map();
  pins: readonly ConversationTreePinTarget[] = [];
  collapsedProjectKeys: ReadonlySet<string> = new Set();
  expandedNodeIds: ReadonlySet<string> = new Set();
  focusedRootId: string | null = null;
  activeNodeId: string | null = null;
  editing: Editing = null;
  removingProjectKeys: ReadonlySet<string> = new Set();
  isCommittingRename = false;
  loadError: string | null = null;
  private isLoading = true;
  private preferencesHydrated = true;
  private disposed = false;
  private loadPromise: Promise<void> | null = null;
  private readonly deps: ConversationTreeStoreDeps;
  private readonly disposers: Array<() => void> = [];

  /** Own the tree's state machine and immediately pair both live streams with lifecycle disposers. */
  constructor(deps: ConversationTreeStoreDeps) {
    this.deps = deps;
    makeAutoObservable<
      this,
      "deps" | "disposed" | "disposers" | "isLoading" | "loadPromise" | "preferencesHydrated"
    >(
      this,
      {
        agents: observable.ref,
        projects: observable.ref,
        workspaceDetails: observable.ref,
        pins: observable.ref,
        collapsedProjectKeys: observable.ref,
        expandedNodeIds: observable.ref,
        editing: observable.ref,
        removingProjectKeys: observable.ref,
        deps: false,
        disposed: false,
        disposers: false,
        isLoading: observable,
        loadPromise: false,
        preferencesHydrated: observable,
      },
      { autoBind: true },
    );
    this.disposers.push(
      deps.data.onAgentUpdate(this.receiveAgentUpdate),
      deps.data.onWorkspaceUpdate(this.receiveWorkspaceUpdate),
    );
  }

  /** Build the full project/conversation hierarchy from the three observable snapshot maps. */
  get tree(): ConversationTreeNode[] {
    return buildConversationTree({
      agents: Array.from(this.agents.values()),
      projects: Array.from(this.projects.values()),
      workspaceDetails: this.workspaceDetails,
    });
  }

  /** Partition the current hierarchy into the three left-panel sections. */
  get partitionedNodes(): PartitionPinnedNodesResult {
    return partitionPinnedNodes({ nodes: this.tree, pins: this.pins });
  }

  /** Flatten all three sections through one expansion policy for Phase B's virtualized list. */
  get visibleRows(): ConversationTreeRow[] {
    const options = {
      isCollapsed: (node: ConversationTreeNode) => this.isNodeCollapsed(node),
      maxDepth: MAX_RENDER_DEPTH,
    };
    const pinned = flattenTreeRows(this.partitionedNodes.pinned, options);
    const projects = flattenTreeRows(this.partitionedNodes.projects, options);
    const loose = flattenTreeRows(this.partitionedNodes.loose, options);
    return [...pinned, ...projects, ...loose];
  }

  /** Derive the store-owned four panel states; offline remains a live React-layer composition. */
  get panelState(): ConversationTreePanelState {
    if (this.loadError !== null) {
      return "error";
    }
    if (this.isLoading || !this.preferencesHydrated) {
      return "loading";
    }
    if (this.tree.length === 0) {
      return "empty";
    }
    return "ready";
  }

  /** Fetch both initial directories concurrently and atomically replace the model snapshots. */
  async load(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.loadPromise !== null) {
      return await this.loadPromise;
    }
    this.isLoading = true;
    this.loadError = null;
    const loading = this.performLoad();
    this.loadPromise = loading;
    try {
      await loading;
    } finally {
      if (this.loadPromise === loading) {
        this.loadPromise = null;
      }
    }
  }

  /** Mark async preference hydration as part of the initial loading boundary. */
  beginPreferenceHydration(): void {
    this.preferencesHydrated = false;
  }

  /** Install persisted pins and project collapse state in one observable transition. */
  hydratePreferences(preferences: ConversationTreePreferences): void {
    this.pins = [...preferences.pins];
    this.collapsedProjectKeys = new Set(preferences.collapsedProjectKeys);
    this.preferencesHydrated = true;
  }

  /** Finish failed preference hydration with defaults so the panel cannot remain stuck loading. */
  finishPreferenceHydration(): void {
    this.preferencesHydrated = true;
  }

  /** Attach composition-root cleanup to the same lifecycle that owns both daemon subscriptions. */
  registerDisposer(disposer: () => void): void {
    if (this.disposed) {
      disposer();
      return;
    }
    this.disposers.push(disposer);
  }

  /** Release both event streams and every composition-root side effect exactly once. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const disposer of this.disposers.splice(0)) {
      disposer();
    }
  }

  /** Toggle persistent project collapse without mixing it with session-only agent expansion. */
  toggleProjectCollapse(projectKey: string): void {
    const collapsed = new Set(this.collapsedProjectKeys);
    if (collapsed.has(projectKey)) {
      collapsed.delete(projectKey);
    } else {
      collapsed.add(projectKey);
    }
    this.collapsedProjectKeys = collapsed;
  }

  /** Toggle a conversation/subagent's session-only expansion identity. */
  toggleExpand(nodeId: string): void {
    const expanded = new Set(this.expandedNodeIds);
    if (expanded.has(nodeId)) {
      expanded.delete(nodeId);
    } else {
      expanded.add(nodeId);
    }
    this.expandedNodeIds = expanded;
  }

  /** Toggle one shared sidebar pin unless the current host is read-only offline. */
  togglePin(target: ConversationTreePinTarget): void {
    if (this.deps.getContext().isOffline) {
      return;
    }
    this.pins = togglePin(this.pins, target);
  }

  /** Expose pin membership through the same pure identity policy used by toggle. */
  isPinned(target: ConversationTreePinTarget): boolean {
    return isPinned(this.pins, target);
  }

  /** Enter inline rename for a current project or directory-backed agent node. */
  beginRename(kind: "project" | "conversation", targetId: string): void {
    if (this.deps.getContext().isOffline) {
      return;
    }
    if (kind === "project") {
      const project = this.projects.get(targetId);
      if (project !== undefined) {
        this.editing = beginRenameState({ kind, targetId, name: project.name });
      }
      return;
    }
    const target = this.agents.get(targetId);
    const workspaceId = target?.workspaceId ?? null;
    if (target === undefined || workspaceId === null) {
      return;
    }
    const workspaceTitle = this.workspaceDetails.get(workspaceId)?.title;
    const name = workspaceTitle ?? target.title ?? target.id;
    this.editing = beginRenameState({ kind, targetId, workspaceId, name });
  }

  /** Replace the current inline draft while preserving its discriminated target identity. */
  setDraftName(draftName: string): void {
    if (this.editing !== null) {
      this.editing = updateRenameDraft(this.editing, draftName);
    }
  }

  /** Cancel inline rename without mutating the underlying project or workspace snapshot. */
  cancelRename(): void {
    if (this.editing !== null) {
      this.editing = cancelRenameState(this.editing);
    }
  }

  /** Commit inline rename non-optimistically and retain the exact draft after any rejection. */
  async commitRename(): Promise<void> {
    const editing = this.editing;
    if (editing === null || this.isCommittingRename || this.deps.getContext().isOffline) {
      return;
    }
    const validation = validateRenameName(editing.draftName);
    if (!validation.ok) {
      this.editing = setRenameError(editing, validation.error);
      return;
    }
    this.isCommittingRename = true;
    try {
      if (editing.kind === "project") {
        const acceptedName = await this.deps.data.renameProject(editing.targetId, validation.name);
        if (!this.disposed) {
          runInAction(() => {
            const project = this.projects.get(editing.targetId);
            if (project !== undefined) {
              const projects = new Map(this.projects);
              projects.set(editing.targetId, { ...project, name: acceptedName });
              this.projects = projects;
            }
          });
        }
      } else {
        await this.deps.data.renameConversation(editing.workspaceId, validation.name);
      }
      if (!this.disposed && this.editing === editing) {
        runInAction(() => {
          this.editing = null;
        });
      }
    } catch (error) {
      if (!this.disposed) {
        this.deps.reportError({ action: "rename", message: errorMessage(error) });
      }
    } finally {
      if (!this.disposed) {
        runInAction(() => {
          this.isCommittingRename = false;
        });
      }
    }
  }

  /** Confirm and remove a project only after RPC success, retaining the row on any rejection. */
  async requestRemoveProject(projectKey: string): Promise<void> {
    if (this.deps.getContext().isOffline || this.removingProjectKeys.has(projectKey)) {
      return;
    }
    const project = this.projects.get(projectKey);
    if (project === undefined) {
      return;
    }
    const confirmed = await this.deps.confirmDestructive({
      title: "移除项目？",
      body: `将从左栏移除 ${project.name}，不删除磁盘上的任何文件。`,
    });
    if (!confirmed || this.disposed) {
      return;
    }
    const removing = new Set(this.removingProjectKeys);
    removing.add(projectKey);
    this.removingProjectKeys = removing;
    try {
      await this.deps.data.removeProject(projectKey);
      if (!this.disposed) {
        runInAction(() => {
          const projects = new Map(this.projects);
          projects.delete(projectKey);
          this.projects = projects;
        });
      }
    } catch (error) {
      if (!this.disposed) {
        this.deps.reportError({ action: "remove", message: errorMessage(error) });
      }
    } finally {
      if (!this.disposed) {
        runInAction(() => {
          const pending = new Set(this.removingProjectKeys);
          pending.delete(projectKey);
          this.removingProjectKeys = pending;
        });
      }
    }
  }

  /** Apply the selection split: roots focus center; subagents preserve center and open right. */
  activateNode(node: SelectableConversationTreeNode): void {
    this.activeNodeId = node.id;
    if (node.kind === "conversation") {
      this.focusedRootId = node.id;
      return;
    }
    this.deps.openRightPanel();
  }

  /** Derive row selection from independent center focus and most-recent activation identities. */
  isRowSelected(node: ConversationTreeNode): boolean {
    return isConversationTreeRowSelected(node, this.focusedRootId, this.activeNodeId);
  }

  /** Open the host-provided search surface while online. */
  openSearch(): void {
    if (!this.deps.getContext().isOffline) {
      this.deps.openSearch();
    }
  }

  /** Copy the provider-native session id, falling back to the stable agent id before runtime attach. */
  copySessionId(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent !== undefined) {
      this.deps.copyToClipboard(agent.sessionId ?? agent.id);
    }
  }

  /** Reveal a known workspace directory through the injected platform file-manager port. */
  async revealWorkspace(workspaceId: string): Promise<void> {
    const detail = this.workspaceDetails.get(workspaceId);
    if (detail !== undefined) {
      await this.deps.openInFinder(detail.directory);
    }
  }

  /** Open a known workspace directory in a new Electron window. */
  openWorkspaceInNewWindow(workspaceId: string): void {
    const detail = this.workspaceDetails.get(workspaceId);
    if (detail !== undefined && this.deps.getContext().isElectron) {
      this.deps.openInNewWindow(detail.directory);
    }
  }

  /** Open the existing global new-conversation flow without project preselection. */
  openNewConversation(): void {
    if (!this.deps.getContext().isOffline) {
      this.deps.navigate(buildNewConversationRoute(this.deps.getContext().serverId));
    }
  }

  /** Open the existing new-conversation flow with one project directory preselected. */
  openProjectConversation(input: Omit<ProjectConversationRouteInput, "serverId">): void {
    if (!this.deps.getContext().isOffline) {
      this.deps.navigate(
        buildProjectConversationRoute({ ...input, serverId: this.deps.getContext().serverId }),
      );
    }
  }

  /** Open the existing project picker when no project directory is known. */
  openProjectPicker(): void {
    if (!this.deps.getContext().isOffline) {
      this.deps.navigate(buildOpenProjectRoute(this.deps.getContext().serverId));
    }
  }

  /** Fetch and fold initial snapshots away from the public load lifecycle guard. */
  private async performLoad(): Promise<void> {
    try {
      const [agents, workspaceSnapshot] = await Promise.all([
        this.deps.data.fetchAgents({ includeArchived: false }),
        this.deps.data.fetchWorkspaces(),
      ]);
      if (this.disposed) {
        return;
      }
      const activeAgents = agents.filter(
        (agent) => agent.archivedAt === null && agent.status !== "closed",
      );
      const nextAgents = new Map(activeAgents.map((agent) => [agent.id, agent]));
      const groupedProjects = groupWorkspacesIntoProjects({
        workspaces: workspaceSnapshot.workspaces,
        emptyProjects: workspaceSnapshot.emptyProjects,
      });
      const nextProjects = new Map(groupedProjects.map((project) => [project.projectKey, project]));
      let nextWorkspaceDetails: ReadonlyMap<string, WorkspaceDetail> = new Map();
      for (const workspace of workspaceSnapshot.workspaces) {
        nextWorkspaceDetails = applyWorkspaceUpdate(nextWorkspaceDetails, workspace);
      }
      const trackedIds = this.trackedAgentIds(nextAgents);
      const unreachableIds = collectUnreachableAgentIds(trackedIds, nextAgents);
      runInAction(() => {
        this.agents = nextAgents;
        this.projects = nextProjects;
        this.workspaceDetails = nextWorkspaceDetails;
        this.clearUnreachableReferences(unreachableIds);
        this.isLoading = false;
        this.loadError = null;
      });
    } catch (error) {
      if (!this.disposed) {
        runInAction(() => {
          this.isLoading = false;
          this.loadError = errorMessage(error);
        });
      }
    }
  }

  /** Apply one decoded agent event and clear every local reference its new graph invalidates. */
  private receiveAgentUpdate(event: AgentUpdateEvent): void {
    if (this.disposed) {
      return;
    }
    const result = applyAgentUpdate({ agents: this.agents, projects: this.projects }, event);
    runInAction(() => {
      this.agents = result.agents;
      this.projects = result.projects;
      this.clearUnreachableReferences(result.unreachableIds);
    });
  }

  /** Fold one decoded workspace upsert so title and hover projections refresh together. */
  private receiveWorkspaceUpdate(workspace: WorkspaceDescriptorPayload): void {
    if (!this.disposed) {
      this.workspaceDetails = applyWorkspaceUpdate(this.workspaceDetails, workspace);
    }
  }

  /** Classify project collapse and agent expansion through their intentionally separate stores. */
  private isNodeCollapsed(node: ConversationTreeNode): boolean {
    if (node.kind === "project") {
      return this.collapsedProjectKeys.has(node.id);
    }
    return !this.expandedNodeIds.has(node.id);
  }

  /** Include current model references in load-time reachability checks even before snapshots arrive. */
  private trackedAgentIds(nextAgents: ReadonlyMap<string, ConversationTreeAgent>): Set<string> {
    const ids = new Set([...this.agents.keys(), ...nextAgents.keys()]);
    if (this.editing?.kind === "conversation") {
      ids.add(this.editing.targetId);
    }
    if (this.activeNodeId !== null) {
      ids.add(this.activeNodeId);
    }
    if (this.focusedRootId !== null) {
      ids.add(this.focusedRootId);
    }
    return ids;
  }

  /** Clear editing and both selection axes in the same observable transaction. */
  private clearUnreachableReferences(unreachableIds: ReadonlySet<string>): void {
    if (this.editing?.kind === "conversation" && unreachableIds.has(this.editing.targetId)) {
      this.editing = null;
    }
    if (this.activeNodeId !== null && unreachableIds.has(this.activeNodeId)) {
      this.activeNodeId = null;
    }
    if (this.focusedRootId !== null && unreachableIds.has(this.focusedRootId)) {
      this.focusedRootId = null;
    }
  }
}

/** Normalize caught boundary values into the reportError port's diagnostic message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
