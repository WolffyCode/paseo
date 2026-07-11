import type { DaemonClient, DaemonEvent } from "@getpaseo/client";
import { getParentAgentIdFromLabels } from "@getpaseo/protocol/agent-labels";
import type {
  AgentSnapshotPayload,
  WorkspaceDescriptorPayload,
  WorkspaceProjectDescriptorPayload,
} from "@getpaseo/protocol/messages";
import type { AgentUpdateEvent } from "../model/apply-agent-update";
import type { ConversationTreeAgent } from "../model/types";
import { normalizeWorkspaceId } from "../model/workspace-id";

const DIRECTORY_PAGE_LIMIT = 200;

type FetchAgentsOptions = Exclude<Parameters<DaemonClient["fetchAgents"]>[0], undefined>;
type FetchWorkspacesOptions = Exclude<Parameters<DaemonClient["fetchWorkspaces"]>[0], undefined>;
type FetchAgentsEntry = Awaited<ReturnType<DaemonClient["fetchAgents"]>>["entries"][number];

export interface ConversationTreeRpcClient {
  readonly fetchAgents: DaemonClient["fetchAgents"];
  readonly fetchWorkspaces: DaemonClient["fetchWorkspaces"];
  readonly subscribe: DaemonClient["subscribe"];
  readonly renameProject: DaemonClient["renameProject"];
  readonly removeProject: DaemonClient["removeProject"];
  readonly setWorkspaceTitle: DaemonClient["setWorkspaceTitle"];
}

export interface ConversationTreeWorkspaceSnapshot {
  readonly workspaces: readonly WorkspaceDescriptorPayload[];
  readonly emptyProjects: readonly WorkspaceProjectDescriptorPayload[];
}

export interface FetchConversationTreeAgentsInput {
  readonly includeArchived: false;
}

export interface ConversationTreeData {
  fetchAgents(input: FetchConversationTreeAgentsInput): Promise<readonly ConversationTreeAgent[]>;
  fetchWorkspaces(): Promise<ConversationTreeWorkspaceSnapshot>;
  onAgentUpdate(handler: (event: AgentUpdateEvent) => void): () => void;
  onWorkspaceUpdate(handler: (workspace: WorkspaceDescriptorPayload) => void): () => void;
  renameProject(projectKey: string, name: string): Promise<string>;
  renameConversation(workspaceId: string, title: string): Promise<void>;
  removeProject(projectKey: string): Promise<void>;
}

export interface CreateConversationTreeDataInput {
  readonly client: ConversationTreeRpcClient;
  readonly subscriptionIdPrefix: string;
}

/** A typed boundary failure for a daemon page that cannot be advanced safely. */
export class ConversationTreePaginationError extends Error {
  readonly resource: "agents" | "workspaces";

  /** Preserve which directory stream violated its cursor contract for actionable diagnostics. */
  constructor(resource: "agents" | "workspaces") {
    super(`${resource} page reported hasMore without a next cursor`);
    this.name = "ConversationTreePaginationError";
    this.resource = resource;
  }
}

/** A typed boundary failure for an accepted write that returned an invalid result shape. */
export class ConversationTreeWriteResultError extends Error {
  readonly action: "renameProject";

  /** Identify the failed write contract without collapsing it into user-facing copy. */
  constructor(action: "renameProject") {
    super(`${action} returned an invalid accepted result`);
    this.name = "ConversationTreeWriteResultError";
    this.action = action;
  }
}

/** Adapt the live DaemonClient surface into conversation-tree snapshots, updates, and writes. */
export function createConversationTreeData(
  input: CreateConversationTreeDataInput,
): ConversationTreeData {
  return {
    /** Fetch the complete active directory and decode every transport snapshot at the boundary. */
    async fetchAgents(_options) {
      const entries = await fetchAllAgentEntries(
        input.client,
        `${input.subscriptionIdPrefix}:agents`,
      );
      return entries.map((entry) => decodeConversationTreeAgent(entry.agent));
    },

    /** Fetch the complete workspace directory while retaining zero-workspace project parents. */
    fetchWorkspaces() {
      return fetchAllWorkspaces(input.client, `${input.subscriptionIdPrefix}:workspaces`);
    },

    /** Subscribe to agent updates and normalize payloads into the reducer's exact event union. */
    onAgentUpdate(handler) {
      return input.client.subscribe((event) => {
        const update = decodeAgentUpdate(event);
        if (update !== null) {
          handler(update);
        }
      });
    },

    /** Subscribe to workspace upserts; removals carry no detail snapshot to fold. */
    onWorkspaceUpdate(handler) {
      return input.client.subscribe((event) => {
        if (event.type === "workspace_update" && event.payload.kind === "upsert") {
          handler(event.payload.workspace);
        }
      });
    },

    /** Rename a project and return the daemon-accepted display name for the non-optimistic patch. */
    async renameProject(projectKey, name) {
      const result = await input.client.renameProject(projectKey, name);
      if (result.customName === null) {
        throw new ConversationTreeWriteResultError("renameProject");
      }
      return result.customName;
    },

    /** Rename a conversation through its workspace title and await daemon acceptance. */
    async renameConversation(workspaceId, title) {
      await input.client.setWorkspaceTitle(workspaceId, title);
    },

    /** Remove only the daemon project registry entry and await acceptance. */
    async removeProject(projectKey) {
      await input.client.removeProject(projectKey);
    },
  };
}

/** Read every active agent page, subscribing only on the first request. */
async function fetchAllAgentEntries(
  client: ConversationTreeRpcClient,
  subscriptionId: string,
): Promise<FetchAgentsEntry[]> {
  const entries: FetchAgentsEntry[] = [];
  let cursor: string | null = null;
  while (true) {
    let options: FetchAgentsOptions;
    if (cursor === null) {
      options = {
        scope: "active",
        page: { limit: DIRECTORY_PAGE_LIMIT },
        subscribe: { subscriptionId },
      };
    } else {
      options = { scope: "active", page: { limit: DIRECTORY_PAGE_LIMIT, cursor } };
    }
    const page = await client.fetchAgents(options);
    entries.push(...page.entries);
    if (!page.pageInfo.hasMore) {
      return entries;
    }
    if (page.pageInfo.nextCursor === null) {
      throw new ConversationTreePaginationError("agents");
    }
    cursor = page.pageInfo.nextCursor;
  }
}

/** Read every workspace page and deduplicate empty project parents on project identity. */
async function fetchAllWorkspaces(
  client: ConversationTreeRpcClient,
  subscriptionId: string,
): Promise<ConversationTreeWorkspaceSnapshot> {
  const workspaces: WorkspaceDescriptorPayload[] = [];
  const emptyProjects = new Map<string, WorkspaceProjectDescriptorPayload>();
  let cursor: string | null = null;
  while (true) {
    let options: FetchWorkspacesOptions;
    if (cursor === null) {
      options = {
        page: { limit: DIRECTORY_PAGE_LIMIT },
        subscribe: { subscriptionId },
      };
    } else {
      options = { page: { limit: DIRECTORY_PAGE_LIMIT, cursor } };
    }
    const page = await client.fetchWorkspaces(options);
    workspaces.push(...page.entries);
    for (const project of page.emptyProjects) {
      emptyProjects.set(project.projectId, project);
    }
    if (!page.pageInfo.hasMore) {
      return { workspaces, emptyProjects: Array.from(emptyProjects.values()) };
    }
    if (page.pageInfo.nextCursor === null) {
      throw new ConversationTreePaginationError("workspaces");
    }
    cursor = page.pageInfo.nextCursor;
  }
}

/** Decode the protocol's optional legacy fields into the model's explicit nullable shape. */
function decodeConversationTreeAgent(snapshot: AgentSnapshotPayload): ConversationTreeAgent {
  const runtimeSessionId = snapshot.runtimeInfo?.sessionId ?? null;
  const persistedSessionId = snapshot.persistence?.sessionId ?? null;
  return {
    id: snapshot.id,
    title: snapshot.title,
    workspaceId: normalizeWorkspaceId(snapshot.workspaceId),
    parentAgentId: getParentAgentIdFromLabels(snapshot.labels),
    status: snapshot.status,
    requiresAttention: snapshot.requiresAttention ?? false,
    attentionReason: snapshot.attentionReason ?? null,
    pendingPermissionCount: snapshot.pendingPermissions.length,
    archivedAt: snapshot.archivedAt ?? null,
    createdAt: snapshot.createdAt,
    sessionId: runtimeSessionId ?? persistedSessionId,
  };
}

/** Filter the shared daemon stream and decode only events owned by the agent reducer. */
function decodeAgentUpdate(event: DaemonEvent): AgentUpdateEvent | null {
  if (event.type !== "agent_update") {
    return null;
  }
  if (event.payload.kind === "remove") {
    return { kind: "remove", agentId: event.payload.agentId };
  }
  const project = event.payload.project;
  return {
    kind: "upsert",
    agent: decodeConversationTreeAgent(event.payload.agent),
    project:
      project === null || project === undefined
        ? null
        : { projectKey: project.projectKey, projectName: project.projectName },
  };
}
