import type { ConversationTreeAgent, ConversationTreeProject } from "./types";
import { normalizeWorkspaceId } from "./workspace-id";

export type AgentUpdateEvent =
  | {
      readonly kind: "upsert";
      readonly agent: ConversationTreeAgent;
      readonly projectKey: string | null;
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
  } else if (isActiveAgent(event.agent)) {
    agents.set(event.agent.id, event.agent);
    updateProjectMembership(projects, event.agent.workspaceId, event.projectKey);
  } else {
    agents.delete(event.agent.id);
  }

  const candidateIds = new Set([...state.agents.keys(), ...agents.keys()]);
  const unreachableIds = new Set<string>();
  for (const agentId of candidateIds) {
    if (!isReachableFromRoot(agentId, agents)) {
      unreachableIds.add(agentId);
    }
  }
  return { agents, projects, unreachableIds };
}

/** Keep only snapshots eligible for the active tree rather than retaining hidden closed records. */
function isActiveAgent(agent: ConversationTreeAgent): boolean {
  return agent.archivedAt === null && agent.status !== "closed";
}

/** Move one workspace identity to its latest project placement without disturbing other workspaces. */
function updateProjectMembership(
  projects: Map<string, ConversationTreeProject>,
  rawWorkspaceId: string | null,
  projectKey: string | null,
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
  if (projectKey === null) {
    return;
  }
  const project = projects.get(projectKey);
  if (project === undefined) {
    projects.set(projectKey, { projectKey, name: projectKey, workspaceIds: [workspaceId] });
    return;
  }
  projects.set(projectKey, {
    ...project,
    workspaceIds: [...project.workspaceIds, workspaceId],
  });
}

/** Follow parent identities to a surviving root and reject missing links or cycles. */
function isReachableFromRoot(
  agentId: string,
  agents: ReadonlyMap<string, ConversationTreeAgent>,
): boolean {
  const visited = new Set<string>();
  let currentId = agentId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const current = agents.get(currentId);
    if (current === undefined) {
      return false;
    }
    if (current.parentAgentId === null) {
      return true;
    }
    currentId = current.parentAgentId;
  }
  return false;
}
