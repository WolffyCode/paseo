/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vendor } from "@getpaseo/protocol/provider-config";

// ---------------------------------------------------------------------------
// Hoisted mocks — must run before any imports from the module graph
// ---------------------------------------------------------------------------

// Mock useConversationModelSelection — injected via props so component tests
// use a stable mock state.

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
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

// Mock unistyles StyleSheet
vi.mock("react-native-unistyles", async () => {
  const { StyleSheet: RNStyleSheet } = await import("react-native");
  return {
    StyleSheet: {
      create: (factory: (theme: unknown) => Record<string, unknown>) => {
        const theme = {
          spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
          fontSize: { xs: 11, sm: 12.5, md: 13 },
          fontWeight: { medium: "500", semibold: "600", bold: "700" },
          borderRadius: { sm: 4, md: 6, lg: 8, "2xl": 16 },
          borderWidth: { 1: 1 },
          colors: {
            foreground: "#e7e9ec",
            foregroundMuted: "#8b929c",
            border: "#2a2f37",
            borderAccent: "#5b8cff",
            surface: "#15171b",
            surface0: "#0e0f12",
            surface2: "#1b1e24",
            accent: "#5b8cff",
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

// Note: @/lib/overlay-root is NOT used by conversation-model-picker.tsx — it
// has its own inline getOrCreateOverlayRoot() helper, so no mock needed here.

// Mock layout hook — mutable so individual tests can override compactness
let mockIsCompact = false;
vi.mock("@/constants/layout", () => ({
  get useIsCompactFormFactor() {
    return () => mockIsCompact;
  },
}));

// Mock expo-router
const mockRouterPush = vi.fn();
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// Mock host-routes so we can assert on navigation target
vi.mock("@/utils/host-routes", () => ({
  buildSettingsHostSectionRoute: (serverId: string, section: string) =>
    `/settings/hosts/${serverId}/${section}`,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ConversationModelPicker } from "./conversation-model-picker";
import type { ConversationModelSelection } from "./use-conversation-model-selection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "vnd_1",
    name: "质谱glm5.0",
    baseUrl: "https://api.zhipu.ai/v1",
    apiFormat: "openai",
    authStyle: "openai-api-key",
    models: [
      { id: "glm-5.2[1M]", label: "GLM 5.2 [1M]" },
      { id: "glm-5.1", label: "GLM 5.1" },
    ],
    exposedModelIds: ["glm-5.2[1M]", "glm-5.1"],
    defaultModelId: "glm-5.2[1M]",
    ...overrides,
  };
}

function makeSelection(
  overrides: Partial<ConversationModelSelection> = {},
): ConversationModelSelection {
  return {
    lockedProvider: "claude",
    cli: "claude",
    vendorId: "vnd_1",
    modelId: "glm-5.2[1M]",
    vendors: [makeVendor()],
    exposedModels: [
      { id: "glm-5.2[1M]", label: "GLM 5.2 [1M]" },
      { id: "glm-5.1", label: "GLM 5.1" },
    ],
    selectVendor: vi.fn(),
    selectModel: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConversationModelPicker — chip rendering", () => {
  it("shows locked provider in chip", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    expect(screen.getByTestId("model-picker-chip")).toBeTruthy();
    // Provider name appears (claude)
    expect(screen.getByTestId("chip-provider")).toBeTruthy();
  });

  it("shows vendor name in chip when vendorId is set", () => {
    const selection = makeSelection({ vendorId: "vnd_1" });
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    expect(screen.getByTestId("chip-vendor")).toBeTruthy();
  });

  it("shows direct-connect label when vendorId is null", () => {
    const selection = makeSelection({ vendorId: null, exposedModels: [] });
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    const vendorEl = screen.getByTestId("chip-vendor");
    // The text should reflect the direct-connect i18n key
    expect(vendorEl.textContent).toContain("conversation.modelPicker.directConnect");
  });

  it("shows modelId in chip", () => {
    const selection = makeSelection({ modelId: "glm-5.2[1M]" });
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    expect(screen.getByTestId("chip-model")).toBeTruthy();
  });
});

describe("ConversationModelPicker — cascade open", () => {
  it("opens cascade when chip is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    expect(screen.getByTestId("cascade-panel")).toBeTruthy();
  });

  it("shows provider locked row in cascade", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    expect(screen.getByTestId("cascade-provider-locked")).toBeTruthy();
  });

  it("shows vendor list in cascade including direct-connect", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    // Direct-connect row
    expect(screen.getByTestId("cascade-vendor-direct")).toBeTruthy();
    // Vendor row for vnd_1
    expect(screen.getByTestId("cascade-vendor-vnd_1")).toBeTruthy();
  });

  it("calls selectVendor when a vendor row is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    fireEvent.click(screen.getByTestId("cascade-vendor-vnd_1"));
    expect(selection.selectVendor).toHaveBeenCalledWith("vnd_1");
  });

  it("calls selectVendor(null) when direct-connect row is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    fireEvent.click(screen.getByTestId("cascade-vendor-direct"));
    expect(selection.selectVendor).toHaveBeenCalledWith(null);
  });

  it("calls selectModel when a model row is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    fireEvent.click(screen.getByTestId("cascade-model-glm-5.2[1M]"));
    expect(selection.selectModel).toHaveBeenCalledWith("glm-5.2[1M]");
  });

  it("shows manage-vendors footer entry", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    expect(screen.getByTestId("cascade-manage-vendors")).toBeTruthy();
  });

  it("navigates to providers settings when manage-vendors is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    fireEvent.click(screen.getByTestId("cascade-manage-vendors"));
    expect(mockRouterPush).toHaveBeenCalledWith("/settings/hosts/srv_1/providers");
  });
});

describe("ConversationModelPicker — compact drill-down back navigation (Fix 3)", () => {
  beforeEach(() => {
    mockIsCompact = true;
  });

  afterEach(() => {
    mockIsCompact = false;
  });

  it("navigates from vendor list to model list when a vendor is pressed", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    // Should start at vendor level — vendor list visible
    expect(screen.getByTestId("cascade-vendor-vnd_1")).toBeTruthy();
    // Press the vendor to drill in
    fireEvent.click(screen.getByTestId("cascade-vendor-vnd_1"));
    // Now model level — back button should be visible
    expect(screen.getByTestId("cascade-back")).toBeTruthy();
    // Vendor list is no longer visible at this level
    expect(screen.queryByTestId("cascade-vendor-vnd_1")).toBeNull();
  });

  it("pressing back button returns to the vendor list", () => {
    const selection = makeSelection();
    render(<ConversationModelPicker serverId="srv_1" selection={selection} />);
    fireEvent.click(screen.getByTestId("model-picker-chip"));
    // Drill into model level
    fireEvent.click(screen.getByTestId("cascade-vendor-vnd_1"));
    expect(screen.getByTestId("cascade-back")).toBeTruthy();
    // Press back
    fireEvent.click(screen.getByTestId("cascade-back"));
    // Should be back at vendor level
    expect(screen.getByTestId("cascade-vendor-vnd_1")).toBeTruthy();
    // Back button gone
    expect(screen.queryByTestId("cascade-back")).toBeNull();
  });
});
