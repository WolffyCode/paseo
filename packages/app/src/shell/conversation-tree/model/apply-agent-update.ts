import type { ConversationTreeAgent, ConversationTreeProject } from "./types";
import { normalizeWorkspaceId } from "./workspace-id";

/** The project a workspace belongs to, always carrying both the merge key and its display name. */
export interface AgentUpdateProjectPlacement {
  readonly projectKey: string;
  readonly projectName: string;
}

export type AgentUpdateEvent =
  | {
      readonly kind: "upsert";
      readonly agent: ConversationTreeAgent;
      readonly project: AgentUpdateProjectPlacement | null;
    }
  | { readonly kind: "remove"; readonly agentId: string };

export interface ConversationTreeSnapshotState {
  readonly agents: ReadonlyMap<string, ConversationTreeAgent>;
  readonly projects: ReadonlyMap<string, ConversationTreeProject>;
}

export interface ApplyAgentUpdateResult extends ConversationTreeSnapshotState {
  readonly unreachableIds: ReadonlySet<string>;
}

/** Apply one daemon agent event and report every identity no longer reachable from a live root. */
export function applyAgentUpdate(
  state: ConversationTreeSnapshotState,
  event: AgentUpdateEvent,
): ApplyAgentUpdateResult {
  const agents = new Map(state.agents);
  const projects = new Map(state.projects);
  if (event.kind === "remove") {
    agents.delete(event.agentId);
  } else if (event.agent.archivedAt === null) {
    // Closed stays in the snapshot (status-dot.ts maps it to idle); archive is the only
    // transition that removes an agent from the active tree, matching build-tree.ts.
    agents.set(event.agent.id, event.agent);
    updateProjectMembership(projects, event.agent.workspaceId, event.project);
  } else {
    agents.delete(event.agent.id);
  }

  const candidateIds = new Set([...state.agents.keys(), ...agents.keys()]);
  const unreachableIds = collectUnreachableAgentIds(candidateIds, agents);
  return { agents, projects, unreachableIds };
}

/** Find tracked identities whose parent chain no longer reaches a surviving root agent. */
export function collectUnreachableAgentIds(
  candidateIds: Iterable<string>,
  agents: ReadonlyMap<string, ConversationTreeAgent>,
): ReadonlySet<string> {
  const unreachableIds = new Set<string>();
  for (const agentId of candidateIds) {
    if (!isReachableFromRoot(agentId, agents)) {
      unreachableIds.add(agentId);
    }
  }
  return unreachableIds;
}

/**
 * Move one workspace identity to its latest project placement without disturbing other
 * workspaces. The merge key is always placement.projectKey — a Map can't fork into two rows
 * for the same key regardless of arrival order. A brand-new project takes its display name from
 * placement.projectName (the daemon always bundles it with projectKey, never one without the
 * other); an already-known project keeps its existing name so this never clobbers a user's
 * custom rename, which arrives through a separate explicit patch (see commitRename).
 */
function updateProjectMembership(
  projects: Map<string, ConversationTreeProject>,
  rawWorkspaceId: string | null,
  placement: AgentUpdateProjectPlacement | null,
): void {
  const workspaceId = normalizeWorkspaceId(rawWorkspaceId);
  if (workspaceId === null) {
    return;
  }
  for (const [key, project] of projects) {
    const remainingWorkspaceIds = project.workspaceIds.filter(
      (candidate) => normalizeWorkspaceId(candidate) !== workspaceId,
    );
    if (remainingWorkspaceIds.length !== project.workspaceIds.length) {
      projects.set(key, { ...project, workspaceIds: remainingWorkspaceIds });
    }
  }
  if (placement === null) {
    return;
  }
  const project = projects.get(placement.projectKey);
  if (project === undefined) {
    projects.set(placement.projectKey, {
      projectKey: placement.projectKey,
      name: placement.projectName,
      workspaceIds: [workspaceId],
    });
    return;
  }
  projects.set(placement.projectKey, {
    ...project,
    workspaceIds: [...project.workspaceIds, workspaceId],
  });
}

/**
 * Follow parent identities up to a root and reject cycles, matching build-tree's promotion rule:
 * the target itself must be present, but an ANCESTOR id absent from every snapshot state is a
 * dangling reference (cross-daemon caller, purged record) that build-tree promotes to its own
 * root rather than hides — so it counts as reachable here too, and selection state survives it.
 * Only a genuinely known ancestor that cascades a filter (e.g. archived) keeps the chain broken.
 */
function isReachableFromRoot(
  agentId: string,
  agents: ReadonlyMap<string, ConversationTreeAgent>,
): boolean {
  const start = agents.get(agentId);
  if (start === undefined) {
    return false;
  }
  const visited = new Set<string>([agentId]);
  let current = start;
  while (current.parentAgentId !== null) {
    const parentId = current.parentAgentId;
    if (visited.has(parentId)) {
      return false;
    }
    const parent = agents.get(parentId);
    if (parent === undefined) {
      return true;
    }
    visited.add(parentId);
    current = parent;
  }
  return true;
}
