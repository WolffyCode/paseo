import type { AgentProvider } from "@getpaseo/protocol/agent-types";

export type CombinedModelSelectorView =
  | { kind: "all" }
  | { kind: "provider"; providerId: string; providerLabel: string };

/** Commit draft provider identity while keeping the selector on that provider's models. */
export function commitProviderDrillDown(
  providerId: AgentProvider,
  providerLabel: string,
  onSelectProvider?: (provider: AgentProvider) => void,
): CombinedModelSelectorView {
  onSelectProvider?.(providerId);
  return { kind: "provider", providerId, providerLabel };
}
