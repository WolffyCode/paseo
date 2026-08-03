import type { ProviderVendor } from "@getpaseo/protocol/provider-config";
import type {
  ProviderSelectionModelRow,
  ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import type {
  CombinedModelSelectorRoute,
  CombinedModelSelectorRoutes,
} from "@/components/combined-model-selector-model";
import { buildFavoriteModelKey } from "@/hooks/use-form-preferences";

export const OFFICIAL_RUNTIME_ROUTE_ID = "";

export interface RuntimeProviderConfig {
  vendors?: ProviderVendor[];
  currentVendorId?: string;
}

/** Project one configured vendor model into the existing model-row contract. */
function buildVendorModelRow(
  provider: ProviderSelectorProvider,
  vendor: ProviderVendor,
  model: NonNullable<ProviderVendor["models"]>[number],
): ProviderSelectionModelRow {
  return {
    favoriteKey: buildFavoriteModelKey({ provider: provider.id, modelId: model.id }),
    provider: provider.id,
    providerLabel: provider.label,
    modelId: model.id,
    modelLabel: model.label ?? model.id,
    description: vendor.label,
    isDefault: model.id === vendor.defaultModelId,
  };
}

/** Restrict a vendor route to enabled, explicitly exposed models. */
function buildVendorRoute(
  provider: ProviderSelectorProvider,
  vendor: ProviderVendor,
): CombinedModelSelectorRoute {
  const exposedIds = new Set(vendor.exposedModelIds ?? []);
  const rows = (vendor.models ?? [])
    .filter((model) => exposedIds.has(model.id))
    .map((model) => buildVendorModelRow(provider, vendor, model));
  return {
    id: vendor.id,
    label: vendor.label,
    modelSelection: { kind: "models", rows },
  };
}

/** Build the provider -> route -> model tree consumed by the Composer selector. */
export function buildRuntimeModelRoutes(input: {
  providers: ProviderSelectorProvider[];
  providerConfigs: Record<string, RuntimeProviderConfig> | undefined;
  officialRouteLabel: string;
}): CombinedModelSelectorRoutes {
  return Object.fromEntries(
    input.providers.map((provider) => {
      const configuredVendors = input.providerConfigs?.[provider.id]?.vendors ?? [];
      const vendorRoutes = configuredVendors
        .filter((vendor) => vendor.enabled ?? true)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((vendor) => buildVendorRoute(provider, vendor));
      return [
        provider.id,
        [
          {
            id: OFFICIAL_RUNTIME_ROUTE_ID,
            label: input.officialRouteLabel,
            modelSelection: provider.modelSelection,
          },
          ...vendorRoutes,
        ],
      ];
    }),
  );
}

/** Resolve the configured route, falling back to official direct when it no longer exists. */
export function resolveSelectedRuntimeRouteId(input: {
  providerId: string;
  providerConfigs: Record<string, RuntimeProviderConfig> | undefined;
  routes: CombinedModelSelectorRoutes;
}): string | null {
  const configuredRouteId = input.providerConfigs?.[input.providerId]?.currentVendorId;
  if (configuredRouteId === undefined) {
    const hasOfficialRoute = input.routes[input.providerId]?.some(
      (route) => route.id === OFFICIAL_RUNTIME_ROUTE_ID,
    );
    return hasOfficialRoute ? OFFICIAL_RUNTIME_ROUTE_ID : null;
  }
  const exists = input.routes[input.providerId]?.some((route) => route.id === configuredRouteId);
  return exists ? configuredRouteId : null;
}
