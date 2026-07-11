import { deriveConversationStatusDot } from "./status-dot";
import type {
  ConversationTreeAgent,
  ConversationTreeConversationNode,
  ConversationTreeNode,
  ConversationTreeProject,
  ConversationTreeSubagentNode,
  WorkspaceDetail,
} from "./types";
import { normalizeWorkspaceId } from "./workspace-id";

export interface BuildConversationTreeInput {
  readonly agents: readonly ConversationTreeAgent[];
  readonly projects: readonly ConversationTreeProject[];
  readonly workspaceDetails: ReadonlyMap<string, WorkspaceDetail>;
}

interface BuildAgentBranchInput {
  readonly agent: ConversationTreeAgent;
  readonly kind: "conversation" | "subagent";
  readonly childrenByParent: ReadonlyMap<string, readonly ConversationTreeAgent[]>;
  readonly workspaceDetails: ReadonlyMap<string, WorkspaceDetail>;
  readonly ancestors: ReadonlySet<string>;
}

interface AgentBranch {
  readonly title: string;
  readonly workspaceId: string | null;
  readonly statusDot: ConversationTreeConversationNode["statusDot"];
  readonly subagentCount: number;
  readonly children: readonly ConversationTreeSubagentNode[];
}

/** Build the project, root-conversation, and recursive subagent hierarchy from live snapshots. */
export function buildConversationTree(input: BuildConversationTreeInput): ConversationTreeNode[] {
  const agentsById = new Map<string, ConversationTreeAgent>();
  for (const candidate of input.agents) {
    agentsById.set(candidate.id, candidate);
  }
  // Archive is the only state that hides a conversation from the tree; closed conversations stay
  // visible (mapped into the idle status dot by status-dot.ts) since their history isn't lost and
  // a new message revives them.
  const liveAgents = Array.from(agentsById.values()).filter(
    (candidate) => candidate.archivedAt === null,
  );

  const childrenByParent = new Map<string, ConversationTreeAgent[]>();
  for (const candidate of liveAgents) {
    if (candidate.parentAgentId === null) {
      continue;
    }
    const children = childrenByParent.get(candidate.parentAgentId) ?? [];
    children.push(candidate);
    childrenByParent.set(candidate.parentAgentId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort(compareAgents);
  }

  const projectKeyByWorkspaceId = new Map<string, string>();
  for (const project of input.projects) {
    for (const rawWorkspaceId of project.workspaceIds) {
      const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
      if (workspaceId !== null) {
        projectKeyByWorkspaceId.set(workspaceId, project.projectKey);
      }
    }
  }

  const rootsByProject = new Map<string, ConversationTreeAgent[]>();
  const looseRoots: ConversationTreeAgent[] = [];
  for (const candidate of liveAgents) {
    // A parent id absent from every snapshot state (cross-daemon caller, purged record) can
    // never be traversed to, so treat the candidate as its own root instead of silently
    // dropping it and its whole subtree. A parent id that IS present (even if filtered out of
    // liveAgents, e.g. archived) keeps today's cascade-filter behavior via non-traversal below.
    const hasKnownParent =
      candidate.parentAgentId !== null && agentsById.has(candidate.parentAgentId);
    if (hasKnownParent) {
      continue;
    }
    const workspaceId = normalizeWorkspaceId(candidate.workspaceId);
    const projectKey = workspaceId === null ? undefined : projectKeyByWorkspaceId.get(workspaceId);
    if (projectKey === undefined) {
      looseRoots.push(candidate);
      continue;
    }
    const roots = rootsByProject.get(projectKey) ?? [];
    roots.push(candidate);
    rootsByProject.set(projectKey, roots);
  }

  const nodes: ConversationTreeNode[] = input.projects.map((project) => {
    const roots = rootsByProject.get(project.projectKey) ?? [];
    roots.sort(compareAgents);
    return {
      kind: "project",
      id: project.projectKey,
      title: project.name,
      workspaceId: null,
      statusDot: null,
      subagentCount: 0,
      children: roots.map((root) =>
        buildConversationNode(root, childrenByParent, input.workspaceDetails),
      ),
    };
  });

  looseRoots.sort(compareAgents);
  for (const root of looseRoots) {
    nodes.push(buildConversationNode(root, childrenByParent, input.workspaceDetails));
  }
  return nodes;
}

/** Order siblings deterministically by creation time, then stable agent identity. */
function compareAgents(left: ConversationTreeAgent, right: ConversationTreeAgent): number {
  const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
  return createdAtDelta !== 0 ? createdAtDelta : left.id.localeCompare(right.id);
}

/** Build a selectable root while allowing only its title to consume live workspace metadata. */
function buildConversationNode(
  agent: ConversationTreeAgent,
  childrenByParent: ReadonlyMap<string, readonly ConversationTreeAgent[]>,
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail>,
): ConversationTreeConversationNode {
  const branch = buildAgentBranch({
    agent,
    kind: "conversation",
    childrenByParent,
    workspaceDetails,
    ancestors: new Set(),
  });
  return { kind: "conversation", id: agent.id, ...branch };
}

/** Build a recursive subagent branch while cutting any repeated identity on the current path. */
function buildSubagentNode(input: BuildAgentBranchInput): ConversationTreeSubagentNode {
  const branch = buildAgentBranch({ ...input, kind: "subagent" });
  return { kind: "subagent", id: input.agent.id, ...branch };
}

/** Derive the shared agent-node fields and aggregate descendant count for one branch. */
function buildAgentBranch(input: BuildAgentBranchInput): AgentBranch {
  const ancestors = new Set(input.ancestors);
  ancestors.add(input.agent.id);
  const childAgents = input.childrenByParent.get(input.agent.id) ?? [];
  const children: ConversationTreeSubagentNode[] = [];
  for (const child of childAgents) {
    if (ancestors.has(child.id)) {
      continue;
    }
    children.push(
      buildSubagentNode({
        agent: child,
        kind: "subagent",
        childrenByParent: input.childrenByParent,
        workspaceDetails: input.workspaceDetails,
        ancestors,
      }),
    );
  }
  let subagentCount = 0;
  for (const child of children) {
    subagentCount += 1 + child.subagentCount;
  }
  return {
    title: resolveAgentTitle(input.agent, input.kind, input.workspaceDetails),
    workspaceId: normalizeWorkspaceId(input.agent.workspaceId),
    statusDot: deriveConversationStatusDot(input.agent),
    subagentCount,
    children,
  };
}

/** Resolve a nonblank row title without allowing workspace names to overwrite subagent labels. */
function resolveAgentTitle(
  agent: ConversationTreeAgent,
  kind: "conversation" | "subagent",
  workspaceDetails: ReadonlyMap<string, WorkspaceDetail>,
): string {
  const workspaceId = normalizeWorkspaceId(agent.workspaceId);
  if (kind === "conversation" && workspaceId !== null) {
    const workspaceTitle = workspaceDetails.get(workspaceId)?.title?.trim() ?? "";
    if (workspaceTitle.length > 0) {
      return workspaceTitle;
    }
  }
  const agentTitle = agent.title?.trim() ?? "";
  return agentTitle.length > 0 ? agentTitle : agent.id;
}
