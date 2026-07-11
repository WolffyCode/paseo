export interface ProjectConversationRouteInput {
  readonly serverId: string;
  readonly sourceDirectory: string;
  readonly projectKey: string;
  readonly projectName: string;
}

/** Identify which required route field was blank before navigation reached Expo Router. */
export class ConversationTreeRouteInputError extends Error {
  readonly field: "serverId" | "sourceDirectory" | "projectKey" | "projectName";

  /** Preserve the invalid field so callers can diagnose the violated model boundary. */
  constructor(field: ConversationTreeRouteInputError["field"]) {
    super(`Conversation tree route requires ${field}`);
    this.name = "ConversationTreeRouteInputError";
    this.field = field;
  }
}

/** Build the global new-conversation destination without project preselection. */
export function buildNewConversationRoute(serverId: string): string {
  return `${buildHostBase(serverId)}/new`;
}

/** Build the project-preselected destination shared by row new-conversation/worktree actions. */
export function buildProjectConversationRoute(input: ProjectConversationRouteInput): string {
  const params = new URLSearchParams({
    dir: requiredValue(input.sourceDirectory, "sourceDirectory"),
    name: requiredValue(input.projectName, "projectName"),
    projectId: requiredValue(input.projectKey, "projectKey"),
  });
  return `${buildHostBase(input.serverId)}/new?${params.toString()}`;
}

/** Build the existing project-picker destination used when directory context is absent. */
export function buildOpenProjectRoute(serverId: string): string {
  return `${buildHostBase(serverId)}/open-project`;
}

/** Build the encoded host prefix shared by every conversation-tree navigation action. */
function buildHostBase(serverId: string): string {
  return `/h/${encodeURIComponent(requiredValue(serverId, "serverId"))}`;
}

/** Normalize a required route field and fail explicitly instead of navigating to a fallback page. */
function requiredValue(value: string, field: ConversationTreeRouteInputError["field"]): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ConversationTreeRouteInputError(field);
  }
  return normalized;
}
