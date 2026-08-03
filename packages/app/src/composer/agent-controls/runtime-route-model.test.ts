import { describe, expect, it } from "vitest";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";
import {
  buildRuntimeModelRoutes,
  OFFICIAL_RUNTIME_ROUTE_ID,
  resolveSelectedRuntimeRouteId,
} from "./runtime-route-model";

const providers: ProviderSelectorProvider[] = [
  {
    id: "codex",
    label: "Codex",
    modelSelection: {
      kind: "models",
      rows: [
        {
          favoriteKey: "codex:gpt-official",
          provider: "codex",
          providerLabel: "Codex",
          modelId: "gpt-official",
          modelLabel: "GPT Official",
        },
      ],
    },
  },
];

describe("runtime route model", () => {
  it("builds official direct plus enabled configured vendors and exposed models", () => {
    const routes = buildRuntimeModelRoutes({
      providers,
      officialRouteLabel: "官方直连",
      providerConfigs: {
        codex: {
          vendors: [
            {
              id: "relay-b",
              label: "Relay B",
              baseUrl: "https://relay-b.example",
              apiFormat: "openai",
              enabled: true,
              order: 2,
              exposedModelIds: ["gpt-b"],
              models: [{ id: "hidden" }, { id: "gpt-b", label: "GPT B" }],
            },
            {
              id: "disabled",
              label: "Disabled",
              baseUrl: "https://disabled.example",
              apiFormat: "openai",
              enabled: false,
            },
          ],
        },
      },
    });

    expect(routes.codex?.map((route) => route.id)).toEqual([OFFICIAL_RUNTIME_ROUTE_ID, "relay-b"]);
    expect(routes.codex?.[1]?.modelSelection).toMatchObject({
      kind: "models",
      rows: [{ modelId: "gpt-b", modelLabel: "GPT B" }],
    });
  });

  it("does not expose vendor models without an explicit exposed-model list", () => {
    const routes = buildRuntimeModelRoutes({
      providers,
      officialRouteLabel: "官方直连",
      providerConfigs: {
        codex: {
          vendors: [
            {
              id: "relay-private",
              label: "Relay Private",
              baseUrl: "https://relay-private.example",
              apiFormat: "openai",
              models: [{ id: "internal-only" }],
            },
          ],
        },
      },
    });

    expect(routes.codex?.[1]?.modelSelection).toEqual({ kind: "models", rows: [] });
  });

  it("uses official direct when route configuration is missing and rejects stale routes", () => {
    const routes = buildRuntimeModelRoutes({
      providers,
      officialRouteLabel: "官方直连",
      providerConfigs: {
        codex: {
          currentVendorId: "relay-b",
          vendors: [
            {
              id: "relay-b",
              label: "Relay B",
              baseUrl: "https://relay-b.example",
              apiFormat: "openai",
            },
          ],
        },
      },
    });

    expect(
      resolveSelectedRuntimeRouteId({
        providerId: "codex",
        providerConfigs: { codex: { currentVendorId: "relay-b" } },
        routes,
      }),
    ).toBe("relay-b");
    expect(
      resolveSelectedRuntimeRouteId({
        providerId: "codex",
        providerConfigs: { codex: { currentVendorId: OFFICIAL_RUNTIME_ROUTE_ID } },
        routes,
      }),
    ).toBe(OFFICIAL_RUNTIME_ROUTE_ID);
    expect(
      resolveSelectedRuntimeRouteId({
        providerId: "codex",
        providerConfigs: { codex: {} },
        routes,
      }),
    ).toBe(OFFICIAL_RUNTIME_ROUTE_ID);
    expect(
      resolveSelectedRuntimeRouteId({
        providerId: "codex",
        providerConfigs: { codex: { currentVendorId: "missing" } },
        routes,
      }),
    ).toBeNull();
  });
});
