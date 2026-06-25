/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorModel } from "@getpaseo/protocol/provider-config";

// ---------------------------------------------------------------------------
// Hoisted mocks — must run before any imports from the module graph
// ---------------------------------------------------------------------------

const mockFetchVendorModels = vi.fn();

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    fetchVendorModels: mockFetchVendorModels,
  }),
}));

// Mock react-i18next so t() returns the last key segment for predictable assertions
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Return the key for simplicity, interpolating obvious vars
      if (opts && typeof opts === "object") {
        return Object.entries(opts).reduce(
          (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
          key,
        );
      }
      return key;
    },
  }),
}));

// Mock unistyles StyleSheet (returns plain RN StyleSheet)
vi.mock("react-native-unistyles", async () => {
  const { StyleSheet: RNStyleSheet } = await import("react-native");
  return {
    StyleSheet: {
      create: (factory: (theme: unknown) => Record<string, unknown>) => {
        const theme = {
          spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
          fontSize: { xs: 11, sm: 13 },
          fontWeight: { medium: "500", semibold: "600" },
          borderRadius: { sm: 4, md: 6, lg: 8 },
          colors: {
            foreground: "#fff",
            foregroundMuted: "#aaa",
            border: "#444",
            borderAccent: "#0a84ff",
            surface: "#1a1a1a",
            surface2: "#222",
            accent: "#0a84ff",
            palette: { red: { 300: "#ff6b6b", 500: "#ff3b30" } },
          },
        };
        return RNStyleSheet.create(factory(theme) as Parameters<typeof RNStyleSheet.create>[0]);
      },
    },
  };
});

// Mock platform constants
vi.mock("@/constants/platform", () => ({
  isNative: false,
  isWeb: true,
  getIsElectron: () => false,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { VendorModelsSelect } from "./vendor-models-select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<React.ComponentProps<typeof VendorModelsSelect>> = {}) {
  return {
    serverId: "test-server",
    baseUrl: "https://relay.example.com/v1",
    apiKey: "sk-test",
    apiFormat: "anthropic" as const,
    authStyle: "anthropic-auth-token" as const,
    models: [],
    exposedModelIds: [],
    defaultModelId: undefined,
    setModels: vi.fn(),
    toggleExposed: vi.fn(),
    addManualModel: vi.fn(),
    setDefaultModel: vi.fn(),
    removeModel: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
});

describe("VendorModelsSelect — fetch state machine", () => {
  beforeEach(() => {
    mockFetchVendorModels.mockReset();
  });

  it("renders fetch button in idle state", () => {
    render(<VendorModelsSelect {...makeProps()} />);
    expect(screen.getByTestId("vendor-models-fetch-btn")).toBeTruthy();
  });

  it("shows loading indicator while fetching", async () => {
    // Prevent the promise from resolving during this test
    mockFetchVendorModels.mockReturnValue(new Promise(() => {}));

    render(<VendorModelsSelect {...makeProps()} />);

    fireEvent.click(screen.getByTestId("vendor-models-fetch-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("vendor-models-loading")).toBeTruthy();
    });
  });

  it("calls setModels with fetched models on success", async () => {
    const setModels = vi.fn();
    const fetchedModels: VendorModel[] = [
      { id: "gpt-4o", source: "fetched" as const },
      { id: "gpt-4o-mini", source: "fetched" as const },
    ];
    mockFetchVendorModels.mockResolvedValue({ models: fetchedModels });

    render(<VendorModelsSelect {...makeProps({ setModels })} />);

    fireEvent.click(screen.getByTestId("vendor-models-fetch-btn"));

    await waitFor(() => {
      expect(setModels).toHaveBeenCalledWith(fetchedModels);
    });
  });

  it("shows error message when fetch returns an error payload", async () => {
    mockFetchVendorModels.mockResolvedValue({ error: "Unauthorized" });

    render(<VendorModelsSelect {...makeProps()} />);

    fireEvent.click(screen.getByTestId("vendor-models-fetch-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("vendor-models-error")).toBeTruthy();
    });
  });

  it("still shows manual-add input after a fetch error", async () => {
    mockFetchVendorModels.mockResolvedValue({ error: "Network error" });

    render(<VendorModelsSelect {...makeProps()} />);

    fireEvent.click(screen.getByTestId("vendor-models-fetch-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("vendor-models-manual-input")).toBeTruthy();
    });
  });

  it("shows manual-add input even in idle state (always available)", () => {
    render(<VendorModelsSelect {...makeProps()} />);
    expect(screen.getByTestId("vendor-models-manual-input")).toBeTruthy();
  });
});

describe("VendorModelsSelect — model list rendering", () => {
  it("renders each model row with a checkbox", () => {
    const models: VendorModel[] = [{ id: "m1" }, { id: "m2" }];
    render(<VendorModelsSelect {...makeProps({ models })} />);
    expect(screen.getByTestId("vendor-model-row-m1")).toBeTruthy();
    expect(screen.getByTestId("vendor-model-row-m2")).toBeTruthy();
  });

  it("pressing a model row checkbox calls toggleExposed with true for un-exposed model", () => {
    const toggleExposed = vi.fn();
    const models: VendorModel[] = [{ id: "m1" }];
    render(<VendorModelsSelect {...makeProps({ models, toggleExposed })} />);

    fireEvent.click(screen.getByTestId("vendor-model-checkbox-m1"));
    expect(toggleExposed).toHaveBeenCalledWith("m1", true);
  });

  it("pressing checkbox on exposed model calls toggleExposed with false", () => {
    const toggleExposed = vi.fn();
    const models: VendorModel[] = [{ id: "m1" }];
    render(
      <VendorModelsSelect {...makeProps({ models, exposedModelIds: ["m1"], toggleExposed })} />,
    );

    fireEvent.click(screen.getByTestId("vendor-model-checkbox-m1"));
    expect(toggleExposed).toHaveBeenCalledWith("m1", false);
  });

  it("shows 'set default' button for exposed non-default models", () => {
    const models: VendorModel[] = [{ id: "m1" }];
    render(<VendorModelsSelect {...makeProps({ models, exposedModelIds: ["m1"] })} />);
    expect(screen.getByTestId("vendor-model-setdefault-m1")).toBeTruthy();
  });

  it("shows default indicator for the default model", () => {
    const models: VendorModel[] = [{ id: "m1" }];
    render(
      <VendorModelsSelect
        {...makeProps({ models, exposedModelIds: ["m1"], defaultModelId: "m1" })}
      />,
    );
    expect(screen.getByTestId("vendor-model-isdefault-m1")).toBeTruthy();
  });

  it("pressing 'set default' calls setDefaultModel", () => {
    const setDefaultModel = vi.fn();
    const models: VendorModel[] = [{ id: "m1" }];
    render(
      <VendorModelsSelect {...makeProps({ models, exposedModelIds: ["m1"], setDefaultModel })} />,
    );

    fireEvent.click(screen.getByTestId("vendor-model-setdefault-m1"));
    expect(setDefaultModel).toHaveBeenCalledWith("m1");
  });
});

describe("VendorModelsSelect — search", () => {
  it("filters model list by search query", () => {
    const models: VendorModel[] = [{ id: "gpt-4o" }, { id: "claude-opus" }];
    render(<VendorModelsSelect {...makeProps({ models })} />);

    fireEvent.change(screen.getByTestId("vendor-models-search"), { target: { value: "gpt" } });

    expect(screen.queryByTestId("vendor-model-row-gpt-4o")).toBeTruthy();
    expect(screen.queryByTestId("vendor-model-row-claude-opus")).toBeNull();
  });
});

describe("VendorModelsSelect — manual add", () => {
  it("pressing add button with text calls addManualModel", () => {
    const addManualModel = vi.fn();
    render(<VendorModelsSelect {...makeProps({ addManualModel })} />);

    act(() => {
      fireEvent.change(screen.getByTestId("vendor-models-manual-input"), {
        target: { value: "my-custom-model" },
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("vendor-models-manual-add-btn"));
    });

    expect(addManualModel).toHaveBeenCalledWith("my-custom-model");
  });
});
