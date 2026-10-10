import type { PlatformScope } from "@getpaseo/protocol/plugin-platform";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../../workspace-registry.js";
import { executionError } from "./execution-errors.js";

/** What the plugin platform needs to know about this host's projects and conversations. */
export interface PlatformScopeDirectory {
  /** Whether a user project with this ID exists on this host. */
  hasProject(projectId: string): Promise<boolean>;
  /** Resolves to the conversation's explicit project (null when independent), or null when absent. */
  conversation(conversationId: string): Promise<{ projectId: string | null } | null>;
}

type ProjectScope = Extract<PlatformScope, { kind: "project" }>;
type ConversationScope = Extract<PlatformScope, { kind: "conversation" }>;
/** A business scope this host owns, in the order its configuration layers apply. */
export type PlatformLayerScope = Exclude<PlatformScope, { kind: "client" }>;

/** Projects conversations onto the platform's scopes from the workspace registries. */
export function createPlatformScopeDirectory(registries: {
  getProject(projectId: string): Promise<Pick<PersistedProjectRecord, "purpose"> | null>;
  getWorkspace(
    workspaceId: string,
  ): Promise<Pick<PersistedWorkspaceRecord, "projectId" | "purpose"> | null>;
}): PlatformScopeDirectory {
  return {
    async hasProject(projectId) {
      const project = await registries.getProject(projectId);
      return project !== null && project.purpose !== "chat";
    },
    async conversation(conversationId) {
      const workspace = await registries.getWorkspace(conversationId);
      if (!workspace) return null;
      // An independent conversation's backing project is execution storage, not a project.
      return { projectId: workspace.purpose === "chat" ? null : workspace.projectId };
    },
  };
}

/**
 * Validates business scopes against this host. A conversation applies the layers of its
 * explicit project only; an independent conversation never inherits the project that backs it.
 */
export class PlatformScopes {
  private readonly serverId: string;
  private readonly directory: PlatformScopeDirectory | null;

  constructor(input: { serverId: string; directory: PlatformScopeDirectory | null }) {
    this.serverId = input.serverId;
    this.directory = input.directory;
  }

  /** The configuration layers of a scope on this host, host first; throws when it is not one. */
  async layers(scope: PlatformScope): Promise<PlatformLayerScope[]> {
    if (scope.kind === "client" || scope.serverId !== this.serverId) {
      throw executionError("NO_EXECUTION_ROUTE", "The scope belongs to another host or a client");
    }
    const host: PlatformLayerScope = { kind: "host", serverId: this.serverId };
    if (scope.kind === "host") return [host];
    if (!this.directory) {
      throw executionError(
        "NO_EXECUTION_ROUTE",
        "This host does not resolve project or conversation scopes",
      );
    }
    if (scope.kind === "project") {
      await this.requireProject(scope.projectId);
      return [host, this.project(scope.projectId)];
    }
    const conversation = await this.directory.conversation(scope.conversationId);
    if (!conversation) {
      throw executionError(
        "RESOURCE_NOT_FOUND",
        `Conversation ${scope.conversationId} does not exist`,
      );
    }
    if (conversation.projectId !== (scope.projectId ?? null)) {
      const membership = conversation.projectId
        ? `belongs to project ${conversation.projectId}`
        : "is independent";
      throw executionError(
        "INVALID_ARGUMENT",
        `Conversation ${scope.conversationId} ${membership}`,
      );
    }
    const target: ConversationScope = {
      kind: "conversation",
      serverId: this.serverId,
      conversationId: scope.conversationId,
    };
    if (!conversation.projectId) return [host, target];
    target.projectId = conversation.projectId;
    return [host, this.project(conversation.projectId), target];
  }

  private async requireProject(projectId: string): Promise<void> {
    if (await this.directory?.hasProject(projectId)) return;
    throw executionError("RESOURCE_NOT_FOUND", `Project ${projectId} does not exist`);
  }

  private project(projectId: string): ProjectScope {
    return { kind: "project", serverId: this.serverId, projectId };
  }
}
