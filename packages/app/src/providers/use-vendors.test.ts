/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vendor } from "@getpaseo/protocol/provider-config";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

const { configState, patchConfigMock } = vi.hoisted(() => ({
  configState: {
    config: null as MutableDaemonConfig | null,
    isLoading: false,
  },
  patchConfigMock: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/use-daemon-config", () => ({
  useDaemonConfig: () => ({
    config: configState.config,
    isLoading: configState.isLoading,
    patchConfig: patchConfigMock,
  }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeIsConnected: () => true,
}));

import { useVendors } from "./use-vendors";

const vendorCcSwitch: Vendor = {
  id: "vendor-cc-1",
  name: "质谱glm5.0",
  baseUrl: "https://api.z.ai/api/anthropic",
  apiKey: "test-key",
  apiFormat: "anthropic",
  authStyle: "anthropic-api-key",
  source: { kind: "cc-switch", id: "cc-switch-1" },
  exposedModelIds: ["glm-5.1", "glm-5.2"],
  models: [
    { id: "glm-5.1", label: "GLM 5.1" },
    { id: "glm-5.2", label: "GLM 5.2" },
  ],
};

const vendorKey: Vendor = {
  id: "vendor-key-1",
  name: "MiniMax",
  baseUrl: "https://api.minimax.chat/anthropic",
  apiKey: "another-key",
  apiFormat: "anthropic",
  authStyle: "anthropic-api-key",
  exposedModelIds: ["minimax-model-1"],
  models: [{ id: "minimax-model-1", label: "MiniMax Model 1" }],
};

const codexVendor: Vendor = {
  id: "codex-vendor-1",
  name: "CodexVendor",
  baseUrl: "https://codex.example.com/api",
  apiFormat: "openai",
  authStyle: "openai-api-key",
  apiKey: "codex-key",
};

function makeConfig(claude: Vendor[] = [], codex: Vendor[] = []): MutableDaemonConfig {
  return {
    mcp: { injectIntoAgents: false },
    providers: {},
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
    vendors: { claude, codex },
  };
}

describe("useVendors", () => {
  beforeEach(() => {
    configState.config = null;
    configState.isLoading = false;
    patchConfigMock.mockReset();
    patchConfigMock.mockResolvedValue(undefined);
  });

  it("initializes with claude selected and returns vendor counts for both CLIs", () => {
    configState.config = makeConfig([vendorCcSwitch, vendorKey], [codexVendor]);

    const { result } = renderHook(() => useVendors("server-1"));

    expect(result.current.selectedCli).toBe("claude");
    expect(result.current.vendorCountByCli).toEqual({ claude: 2, codex: 1 });
  });

  it("vendorsForSelectedCli reflects the currently selected CLI vendors", () => {
    configState.config = makeConfig([vendorCcSwitch], [codexVendor]);

    const { result } = renderHook(() => useVendors("server-1"));

    // Claude selected initially
    expect(result.current.vendorsForSelectedCli).toHaveLength(1);
    expect(result.current.vendorsForSelectedCli[0].id).toBe("vendor-cc-1");
  });

  it("switches selected CLI and returns the other CLI vendors", () => {
    configState.config = makeConfig([vendorCcSwitch], [codexVendor]);

    const { result } = renderHook(() => useVendors("server-1"));

    act(() => {
      result.current.setSelectedCli("codex");
    });

    expect(result.current.selectedCli).toBe("codex");
    expect(result.current.vendorsForSelectedCli).toHaveLength(1);
    expect(result.current.vendorsForSelectedCli[0].id).toBe("codex-vendor-1");
  });

  it("deleteVendor calls patchConfig with the vendor removed from the array", async () => {
    configState.config = makeConfig([vendorCcSwitch, vendorKey], []);

    const { result } = renderHook(() => useVendors("server-1"));

    await act(async () => {
      await result.current.deleteVendor("claude", "vendor-cc-1");
    });

    expect(patchConfigMock).toHaveBeenCalledTimes(1);
    expect(patchConfigMock).toHaveBeenCalledWith({
      vendors: { claude: [vendorKey] },
    });
  });

  it("upsertVendor replaces an existing vendor by id", async () => {
    configState.config = makeConfig([vendorCcSwitch], []);

    const { result } = renderHook(() => useVendors("server-1"));
    const updated: Vendor = { ...vendorCcSwitch, name: "Updated Name" };

    await act(async () => {
      await result.current.upsertVendor("claude", updated);
    });

    expect(patchConfigMock).toHaveBeenCalledWith({
      vendors: { claude: [updated] },
    });
  });

  it("upsertVendor appends a new vendor when id does not exist", async () => {
    configState.config = makeConfig([vendorCcSwitch], []);

    const { result } = renderHook(() => useVendors("server-1"));
    const newVendor: Vendor = {
      id: "brand-new",
      name: "Brand New",
      baseUrl: "https://new.example.com",
      apiFormat: "anthropic",
      authStyle: "anthropic-api-key",
    };

    await act(async () => {
      await result.current.upsertVendor("claude", newVendor);
    });

    expect(patchConfigMock).toHaveBeenCalledWith({
      vendors: { claude: [vendorCcSwitch, newVendor] },
    });
  });

  it("isWritable is true when config is available", () => {
    configState.config = makeConfig([], []);

    const { result } = renderHook(() => useVendors("server-1"));

    expect(result.current.isWritable).toBe(true);
  });

  it("isWritable is false when config is null", () => {
    configState.config = null;

    const { result } = renderHook(() => useVendors("server-1"));

    expect(result.current.isWritable).toBe(false);
  });

  it("returns empty vendor arrays when config has no vendors field", () => {
    configState.config = {
      mcp: { injectIntoAgents: false },
      providers: {},
      metadataGeneration: { providers: [] },
      autoArchiveAfterMerge: false,
      enableTerminalAgentHooks: false,
      appendSystemPrompt: "",
    };

    const { result } = renderHook(() => useVendors("server-1"));

    expect(result.current.vendorCountByCli).toEqual({ claude: 0, codex: 0 });
    expect(result.current.vendorsForSelectedCli).toHaveLength(0);
  });
});
