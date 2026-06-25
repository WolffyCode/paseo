import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { DaemonConfigStore } from "./daemon-config-store.js";
import { buildVendorLaunchResolver } from "./bootstrap.js";

const makeStore = (paseoHome: string) =>
  new DaemonConfigStore(
    paseoHome,
    {
      mcp: { injectIntoAgents: true },
      providers: {},
      metadataGeneration: { providers: [] },
      autoArchiveAfterMerge: false,
      enableTerminalAgentHooks: false,
      appendSystemPrompt: "",
    },
    undefined,
  );

describe("buildVendorLaunchResolver", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns undefined when vendor not yet in store", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-vlr-"));
    tempDirs.push(paseoHome);
    const store = makeStore(paseoHome);
    const resolver = buildVendorLaunchResolver(store);

    expect(resolver({ provider: "claude", vendorId: "vnd_missing" })).toBeUndefined();
  });

  test("reflects runtime vendor patch immediately — resolves vendor added after resolver was built", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-vlr-"));
    tempDirs.push(paseoHome);
    const store = makeStore(paseoHome);

    // Build the resolver BEFORE any vendors exist
    const resolver = buildVendorLaunchResolver(store);

    const vendor = {
      id: "vnd_live",
      name: "LiveVendor",
      baseUrl: "https://api.example.com/v1",
      apiFormat: "openai" as const,
      authStyle: "openai-api-key" as const,
    };

    // Simulate runtime CRUD: patch the store after resolver construction
    store.patch({ vendors: { claude: [vendor] } });

    // The resolver must now see the live vendor (it closed over the store, not the static config)
    const result = resolver({ provider: "claude", vendorId: "vnd_live" });
    expect(result).toBeDefined();
    expect(result?.vendor).toEqual(vendor);
  });

  test("returns commonConfig when present in live store", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-vlr-"));
    tempDirs.push(paseoHome);
    const store = makeStore(paseoHome);

    const resolver = buildVendorLaunchResolver(store);

    const vendor = {
      id: "vnd_common",
      name: "CommonVendor",
      baseUrl: "https://api.example.com/v1",
      apiFormat: "openai" as const,
      authStyle: "openai-api-key" as const,
    };
    const commonConfig = { env: { COMMON_KEY: "shared" } };

    store.patch({
      vendors: { claude: [vendor] },
      vendorCommonConfig: { claude: commonConfig },
    });

    const result = resolver({ provider: "claude", vendorId: "vnd_common" });
    expect(result?.commonConfig).toEqual(commonConfig);
  });

  test("resolver returns undefined after vendor is deleted via store patch", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-vlr-"));
    tempDirs.push(paseoHome);
    const store = makeStore(paseoHome);

    const vendor = {
      id: "vnd_delete",
      name: "ToDelete",
      baseUrl: "https://api.example.com/v1",
      apiFormat: "openai" as const,
      authStyle: "openai-api-key" as const,
    };

    store.patch({ vendors: { claude: [vendor] } });
    const resolver = buildVendorLaunchResolver(store);

    // Verify it resolves first
    expect(resolver({ provider: "claude", vendorId: "vnd_delete" })).toBeDefined();

    // Delete the vendor
    store.patch({ vendors: { claude: [] } });

    // Now it should be gone
    expect(resolver({ provider: "claude", vendorId: "vnd_delete" })).toBeUndefined();
  });
});
