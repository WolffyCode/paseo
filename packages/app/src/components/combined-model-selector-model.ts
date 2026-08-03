import type { ProviderModelSelection } from "@/provider-selection/provider-selection";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

export type CombinedModelSelectorView =
  | { kind: "all" }
  | { kind: "routes"; providerId: string; providerLabel: string }
  | {
      kind: "provider";
      providerId: string;
      providerLabel: string;
      routeId: string;
      routeLabel: string;
    };

export interface CombinedModelSelectorRoute {
  id: string;
  label: string;
  modelSelection: ProviderModelSelection;
}

export type CombinedModelSelectorRoutes = Readonly<Record<string, CombinedModelSelectorRoute[]>>;

/** Resolve the selector level from the currently completed provider-route-model chain. */
export function resolveCombinedModelSelectorInitialView(input: {
  selectedProvider: string;
  selectedRouteId: string | null;
  selectedModel: string;
  providerLabel: string;
  routes: CombinedModelSelectorRoutes;
}): CombinedModelSelectorView {
  const { selectedProvider, selectedRouteId, selectedModel, providerLabel, routes } = input;
  if (!selectedProvider) {
    return { kind: "all" };
  }
  const route = routes[selectedProvider]?.find((candidate) => candidate.id === selectedRouteId);
  if (!route) {
    return { kind: "routes", providerId: selectedProvider, providerLabel };
  }
  if (!selectedModel) {
    return {
      kind: "provider",
      providerId: selectedProvider,
      providerLabel,
      routeId: route.id,
      routeLabel: route.label,
    };
  }
  return {
    kind: "provider",
    providerId: selectedProvider,
    providerLabel,
    routeId: route.id,
    routeLabel: route.label,
  };
}

/** Commit a provider choice and advance the cascade to that provider's routes. */
export function selectProviderView(
  providerId: AgentProvider,
  providerLabel: string,
  onSelectProvider?: (provider: AgentProvider) => void,
): CombinedModelSelectorView {
  onSelectProvider?.(providerId);
  return { kind: "routes", providerId, providerLabel };
}

/** Commit a route choice and advance the cascade to that route's models. */
export function selectRouteView(input: {
  providerId: string;
  providerLabel: string;
  routeId: string;
  routeLabel: string;
  onSelectRoute?: (providerId: string, routeId: string) => void;
}): CombinedModelSelectorView {
  input.onSelectRoute?.(input.providerId, input.routeId);
  return {
    kind: "provider",
    providerId: input.providerId,
    providerLabel: input.providerLabel,
    routeId: input.routeId,
    routeLabel: input.routeLabel,
  };
}
