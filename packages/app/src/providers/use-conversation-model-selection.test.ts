/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Vendor } from "@getpaseo/protocol/provider-config";

// ── useVendors mock ───────────────────────────────────────────────────────────
const vendorsState = {
  selectedCli: "claude" as "claude" | "codex",
  setSelectedCli: vi.fn(),
  vendorsForSelectedCli: [] as Vendor[],
  vendorCountByCli: { claude: 0, codex: 0 },
  deleteVendor: vi.fn(),
  upsertVendor: vi.fn(),
  isWritable: true,
};

vi.mock("@/providers/use-vendors", () => ({
  useVendors: () => vendorsState,
}));

// The hook under test — imported AFTER mocks
import { useConversationModelSelection } from "./use-conversation-model-selection";

const makeVendor = (overrides: Partial<Vendor> = {}): Vendor => ({
  id: "vnd_1",
  name: "Z.AI",
  baseUrl: "https://api.z.ai",
  apiFormat: "anthropic",
  authStyle: "anthropic-api-key",
  models: [
    { id: "glm-5.2", label: "GLM 5.2" },
    { id: "glm-5.1", label: "GLM 5.1" },
  ],
  exposedModelIds: ["glm-5.2", "glm-5.1"],
  defaultModelId: "glm-5.2",
  ...overrides,
});

interface ComposerStateSlice {
  selectedProvider: string | null;
  selectedVendorId: string | null;
  selectedModel: string;
  setVendorIdFromUser: (id: string | null) => void;
  setModelFromUser: (id: string) => void;
}

function makeComposerState(overrides: Partial<ComposerStateSlice> = {}): ComposerStateSlice {
  return {
    selectedProvider: "claude",
    selectedVendorId: null,
    selectedModel: "",
    setVendorIdFromUser: vi.fn(),
    setModelFromUser: vi.fn(),
    ...overrides,
  };
}

describe("useConversationModelSelection", () => {
  beforeEach(() => {
    vendorsState.selectedCli = "claude";
    vendorsState.vendorsForSelectedCli = [];
    vendorsState.setSelectedCli.mockReset();
  });

  it("lockedProvider is always the draft selectedProvider", () => {
    const cs = makeComposerState({ selectedProvider: "claude" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.lockedProvider).toBe("claude");
  });

  it("lockedProvider stays locked even if provider changes externally", () => {
    const cs = makeComposerState({ selectedProvider: "codex" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.lockedProvider).toBe("codex");
  });

  it("cli maps claude → claude", () => {
    const cs = makeComposerState({ selectedProvider: "claude" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.cli).toBe("claude");
  });

  it("cli maps codex → codex", () => {
    const cs = makeComposerState({ selectedProvider: "codex" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.cli).toBe("codex");
  });

  it("vendorId starts null (direct-connect)", () => {
    const cs = makeComposerState({ selectedVendorId: null });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.vendorId).toBeNull();
  });

  it("selectVendor calls setVendorIdFromUser with the given id", () => {
    const setVendorIdFromUser = vi.fn();
    const setModelFromUser = vi.fn();
    const vendor = makeVendor();
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ setVendorIdFromUser, setModelFromUser });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    act(() => {
      result.current.selectVendor("vnd_1");
    });

    expect(setVendorIdFromUser).toHaveBeenCalledWith("vnd_1");
  });

  it("selectVendor resets modelId to vendor.defaultModelId", () => {
    const setModelFromUser = vi.fn();
    const vendor = makeVendor({ defaultModelId: "glm-5.2" });
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ setModelFromUser });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    act(() => {
      result.current.selectVendor("vnd_1");
    });

    expect(setModelFromUser).toHaveBeenCalledWith("glm-5.2");
  });

  it("selectVendor falls back to first exposedModelIds entry when no defaultModelId", () => {
    const setModelFromUser = vi.fn();
    const vendor = makeVendor({ defaultModelId: undefined });
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ setModelFromUser });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    act(() => {
      result.current.selectVendor("vnd_1");
    });

    // first exposed = "glm-5.2"
    expect(setModelFromUser).toHaveBeenCalledWith("glm-5.2");
  });

  it("selectVendor(null) clears vendorId and does NOT reset model", () => {
    const setVendorIdFromUser = vi.fn();
    const setModelFromUser = vi.fn();
    const vendor = makeVendor();
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({
      selectedVendorId: "vnd_1",
      setVendorIdFromUser,
      setModelFromUser,
    });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    act(() => {
      result.current.selectVendor(null);
    });

    expect(setVendorIdFromUser).toHaveBeenCalledWith(null);
    // model not touched for direct-connect
    expect(setModelFromUser).not.toHaveBeenCalled();
  });

  it("exposedModels is populated for current vendor (models ∩ exposedModelIds)", () => {
    const vendor = makeVendor({
      models: [
        { id: "glm-5.2", label: "GLM 5.2" },
        { id: "glm-5.1", label: "GLM 5.1" },
        { id: "hidden", label: "Hidden" },
      ],
      exposedModelIds: ["glm-5.2", "glm-5.1"],
    });
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ selectedVendorId: "vnd_1" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    expect(result.current.exposedModels).toHaveLength(2);
    expect(result.current.exposedModels.map((m) => m.id)).toEqual(["glm-5.2", "glm-5.1"]);
  });

  it("exposedModels defaults to all models when exposedModelIds is absent", () => {
    const vendor = makeVendor({ exposedModelIds: undefined });
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ selectedVendorId: "vnd_1" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    // all 2 models exposed when no exposedModelIds
    expect(result.current.exposedModels).toHaveLength(2);
  });

  it("exposedModels is empty when vendorId is null (direct-connect)", () => {
    vendorsState.vendorsForSelectedCli = [makeVendor()];

    const cs = makeComposerState({ selectedVendorId: null });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    expect(result.current.exposedModels).toHaveLength(0);
  });

  it("selectModel calls setModelFromUser", () => {
    const setModelFromUser = vi.fn();
    const vendor = makeVendor();
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState({ selectedVendorId: "vnd_1", setModelFromUser });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    act(() => {
      result.current.selectModel("glm-5.1");
    });

    expect(setModelFromUser).toHaveBeenCalledWith("glm-5.1");
  });

  it("vendors is the vendorsForSelectedCli from useVendors", () => {
    const vendor = makeVendor();
    vendorsState.vendorsForSelectedCli = [vendor];

    const cs = makeComposerState();
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));

    expect(result.current.vendors).toHaveLength(1);
    expect(result.current.vendors[0].id).toBe("vnd_1");
  });

  it("modelId reflects selectedModel from composerState", () => {
    const cs = makeComposerState({ selectedModel: "glm-5.1" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.modelId).toBe("glm-5.1");
  });

  it("modelId is null when selectedModel is empty string", () => {
    const cs = makeComposerState({ selectedModel: "" });
    const { result } = renderHook(() => useConversationModelSelection("server-1", cs));
    expect(result.current.modelId).toBeNull();
  });
});
