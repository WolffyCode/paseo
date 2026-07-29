export type ConversationViewIdentity =
  | { readonly kind: "agent"; readonly agentId: string }
  | { readonly kind: "draft"; readonly draftId: string };

/** Build the host-scoped identity that isolates one center conversation's auxiliary workspace. */
export function buildConversationViewKey(
  serverId: string,
  target: ConversationViewIdentity,
): string {
  return target.kind === "agent"
    ? `${serverId}:agent:${target.agentId}`
    : `${serverId}:draft:${target.draftId}`;
}
