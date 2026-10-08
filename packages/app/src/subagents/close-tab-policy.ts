import type { WorkspaceDescriptor, Agent } from "@/stores/session-store";

export type CloseAgentTabPolicy = { kind: "archive-on-close" } | { kind: "layout-only" };

export function resolveCloseAgentTabPolicy(
  agent: Pick<Agent, "parentAgentId"> | null | undefined,
  workspace?: Pick<WorkspaceDescriptor, "purpose"> | null,
): CloseAgentTabPolicy {
  if (workspace?.purpose === "chat" || agent?.parentAgentId) {
    return { kind: "layout-only" };
  }

  return { kind: "archive-on-close" };
}
