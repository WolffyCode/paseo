import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import {
  buildRuntimeModelRoutes,
  resolveSelectedRuntimeRouteId,
  type RuntimeProviderConfig,
} from "./runtime-route-model";

/** Bind the Composer's route cascade to the host's single persisted provider configuration. */
export function useComposerModelRoutes(input: {
  serverId: string | null;
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
}) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(input.serverId);
  const providerConfigs = config?.providers as Record<string, RuntimeProviderConfig> | undefined;
  const routes = useMemo(
    () =>
      buildRuntimeModelRoutes({
        providers: input.providers,
        providerConfigs,
        officialRouteLabel: t("modelSelector.officialDirect"),
      }),
    [input.providers, providerConfigs, t],
  );
  const selectedRouteId = resolveSelectedRuntimeRouteId({
    providerId: input.selectedProvider,
    providerConfigs,
    routes,
  });

  const selectRoute = useCallback(
    (providerId: string, routeId: string) => {
      if (!input.serverId) return;
      void patchConfig({ providers: { [providerId]: { currentVendorId: routeId } } }).catch(
        (error) => {
          console.warn("[ComposerModelRoutes] persist route selection failed", error);
        },
      );
    },
    [input.serverId, patchConfig],
  );

  return { routes, selectedRouteId, selectRoute };
}
