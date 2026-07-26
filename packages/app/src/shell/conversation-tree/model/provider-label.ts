import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";

export type ProviderIconKey = "claude" | "codex" | "copilot" | "opencode" | "pi";

export interface ProviderBadge {
  readonly label: string;
  readonly icon: ProviderIconKey | null;
}

/** Resolve a provider label from the protocol catalog without throwing for custom providers. */
export function resolveProviderBadge(providerId: string): ProviderBadge {
  const definition = AGENT_PROVIDER_DEFINITIONS.find((entry) => entry.id === providerId);
  const icon = providerId === "omp" || definition === undefined ? null : providerId;
  return { label: definition?.label ?? providerId, icon: isProviderIconKey(icon) ? icon : null };
}

/** Keep the provider icon union closed while allowing the catalog to remain open-ended. */
function isProviderIconKey(value: string | null): value is ProviderIconKey {
  return (
    value === "claude" ||
    value === "codex" ||
    value === "copilot" ||
    value === "opencode" ||
    value === "pi"
  );
}
