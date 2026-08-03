import { describe, expect, it, vi } from "vitest";
import {
  resolveCombinedModelSelectorInitialView,
  selectProviderView,
  selectRouteView,
  type CombinedModelSelectorRoutes,
} from "./combined-model-selector-model";

const routes: CombinedModelSelectorRoutes = {
  codex: [
    {
      id: "official",
      label: "Official",
      modelSelection: { kind: "models", rows: [] },
    },
  ],
};

describe("combined model selector cascade", () => {
  it("starts at providers when no provider is selected", () => {
    expect(
      resolveCombinedModelSelectorInitialView({
        selectedProvider: "",
        selectedRouteId: "",
        selectedModel: "",
        providerLabel: "Provider",
        routes,
      }),
    ).toEqual({ kind: "all" });
  });

  it("starts at routes when the selected provider has no selected route", () => {
    expect(
      resolveCombinedModelSelectorInitialView({
        selectedProvider: "codex",
        selectedRouteId: null,
        selectedModel: "",
        providerLabel: "Codex",
        routes,
      }),
    ).toEqual({ kind: "routes", providerId: "codex", providerLabel: "Codex" });
  });

  it("starts at models when provider and route are complete", () => {
    expect(
      resolveCombinedModelSelectorInitialView({
        selectedProvider: "codex",
        selectedRouteId: "official",
        selectedModel: "gpt-5.6",
        providerLabel: "Codex",
        routes,
      }),
    ).toEqual({
      kind: "provider",
      providerId: "codex",
      providerLabel: "Codex",
      routeId: "official",
      routeLabel: "Official",
    });
  });

  it("commits the provider and opens its route view", () => {
    const onSelectProvider = vi.fn();

    expect(selectProviderView("claude", "Claude", onSelectProvider)).toEqual({
      kind: "routes",
      providerId: "claude",
      providerLabel: "Claude",
    });
    expect(onSelectProvider).toHaveBeenCalledOnce();
    expect(onSelectProvider).toHaveBeenCalledWith("claude");
  });

  it("commits the route and opens its model view", () => {
    const onSelectRoute = vi.fn();
    expect(
      selectRouteView({
        providerId: "codex",
        providerLabel: "Codex",
        routeId: "official",
        routeLabel: "Official",
        onSelectRoute,
      }),
    ).toEqual({
      kind: "provider",
      providerId: "codex",
      providerLabel: "Codex",
      routeId: "official",
      routeLabel: "Official",
    });
    expect(onSelectRoute).toHaveBeenCalledWith("codex", "official");
  });
});
