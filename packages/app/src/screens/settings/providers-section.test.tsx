/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Vendor } from "@getpaseo/protocol/provider-config";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

interface AlertButton {
  text?: string;
  style?: string;
  onPress?: () => void;
}
const alertCalls: { title: string; message: string; buttons: AlertButton[] }[] = [];

const {
  theme,
  configState,
  patchConfigMock,
  onEditVendorMock,
  onOpenSyncMock,
  alertMock,
  isCompactState,
} = vi.hoisted(() => ({
  // isCompactState must be inside vi.hoisted so it exists when vi.mock factories run
  isCompactState: { value: false },
  theme: {
    spacing: { 0: 0, 1: 4, "1.5": 6, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
    iconSize: { xs: 12, sm: 14, md: 16, lg: 20 },
    fontSize: { xs: 12, sm: 14, base: 16, lg: 18 },
    fontWeight: { normal: "normal", medium: "500", semibold: "600", bold: "bold" },
    borderRadius: { none: 0, sm: 2, base: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 9999 },
    opacity: { 0: 0, 50: 0.5, 100: 1 },
    colors: {
      surface0: "#0e0f12",
      surface1: "#15171b",
      surface2: "#1b1e24",
      surface3: "#20242b",
      surface4: "#2a2f37",
      surfaceSidebar: "#101216",
      foreground: "#e7e9ec",
      foregroundMuted: "#8b929c",
      border: "#2a2f37",
      borderAccent: "#363c45",
      accent: "#5b8cff",
      statusSuccess: "#3fb27f",
      statusDanger: "#ff5555",
      statusWarning: "#f59e0b",
      destructive: "#c44a4a",
      palette: {
        red: { 300: "#ff6b6b" },
        white: "#fff",
      },
    },
  },
  configState: {
    config: null as MutableDaemonConfig | null,
    isLoading: false,
  },
  patchConfigMock: vi.fn(async () => undefined),
  onEditVendorMock: vi.fn(),
  onOpenSyncMock: vi.fn(),
  alertMock: vi.fn((title: string, message: string, buttons: AlertButton[]) => {
    alertCalls.push({ title, message, buttons });
  }),
}));

vi.mock("react-native", () => ({
  View: ({
    children,
    testID,
    onPointerEnter,
    onPointerLeave,
  }: {
    children?: React.ReactNode;
    testID?: string;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    style?: unknown;
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": testID,
        onMouseEnter: onPointerEnter,
        onMouseLeave: onPointerLeave,
      },
      children,
    ),
  Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("span", { "data-testid": testID }, children),
  Pressable: ({
    children,
    onPress,
    onHoverIn,
    onHoverOut,
    accessibilityRole,
    accessibilityLabel,
    disabled,
    testID,
  }: {
    children?:
      | React.ReactNode
      | ((state: { pressed: boolean; hovered: boolean }) => React.ReactNode);
    onPress?: (event: React.MouseEvent) => void;
    onHoverIn?: () => void;
    onHoverOut?: () => void;
    accessibilityRole?: string;
    accessibilityLabel?: string;
    disabled?: boolean;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        role: accessibilityRole ?? "button",
        "aria-label": accessibilityLabel,
        "aria-disabled": disabled ? "true" : undefined,
        "data-testid": testID,
        onClick: disabled ? undefined : onPress,
        onMouseEnter: onHoverIn,
        onMouseLeave: onHoverOut,
      },
      typeof children === "function" ? children({ pressed: false, hovered: false }) : children,
    ),
  Alert: {
    alert: alertMock,
  },
  ActivityIndicator: () => React.createElement("span", { "data-testid": "activity-indicator" }),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
  },
  useUnistyles: () => ({ theme, rt: { breakpoint: "lg" } }),
  withUnistyles: (Comp: React.ComponentType<unknown>) => Comp,
}));

vi.mock("lucide-react-native", () => {
  const icon =
    (name: string) =>
    ({ size, color }: { size?: number; color?: string }) =>
      React.createElement("span", { "data-icon": name, "data-size": size, "data-color": color });
  return {
    ChevronRight: icon("ChevronRight"),
    ChevronDown: icon("ChevronDown"),
    Plus: icon("Plus"),
    Pencil: icon("Pencil"),
    Trash2: icon("Trash2"),
    RefreshCw: icon("RefreshCw"),
    RotateCw: icon("RotateCw"),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "settings.vendors.pageTitle": "提供方",
        "settings.vendors.syncButton": "⟳ 一键同步 cc switch",
        "settings.vendors.colLabel": "① 提供方（仅 2 个）",
        "settings.vendors.claudeCode": "Claude Code",
        "settings.vendors.codex": "Codex",
        "settings.vendors.vendorCountSuffix": `${values?.count} 个供应商`,
        "settings.vendors.fixNote":
          "只放 Claude Code + Codex（中转/relay 场景）。其余 CLI 隐藏，不支持新增/删除。",
        "settings.vendors.vendorAreaLabel": "② 模型供应商 / 中转站",
        "settings.vendors.directConnect": "直连 · Anthropic 官方登录",
        "settings.vendors.defaultBadge": "默认",
        "settings.vendors.directConnectNote": "不走中转站",
        "settings.vendors.officialModels": "官方模型",
        "settings.vendors.ccSwitchBadge": "cc switch",
        "settings.vendors.keyBadge": "key",
        "settings.vendors.addVendorButton": "＋ 新增供应商（手动填 url + key）",
        "settings.vendors.editVendor": "编辑供应商",
        "settings.vendors.deleteVendor": "删除供应商",
        "settings.vendors.deleteConfirmTitle": "删除供应商",
        "settings.vendors.deleteConfirmMessage": "确定要删除该供应商吗？",
        "settings.vendors.deleteConfirmOk": "删除",
        "settings.vendors.deleteConfirmCancel": "取消",
        "settings.vendors.modelsPreviewLabel": `③ 模型 · 放出来 ${values?.count} 个 · 自动拉取`,
        "settings.vendors.fetchModels": "⟳ 拉取",
        "settings.vendors.defaultModelTag": "默认",
        "settings.vendors.modelCount": `${values?.count} 模型`,
        "settings.vendors.expandVendor": "展开",
        "settings.vendors.collapseVendor": "折叠",
      };
      return map[key] ?? key;
    },
  }),
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

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => isCompactState.value,
}));

vi.mock("@/constants/platform", () => ({
  isNative: false,
  isWeb: true,
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({
    children,
    title,
    testID,
    trailing,
  }: {
    children?: React.ReactNode;
    title?: string;
    testID?: string;
    trailing?: React.ReactNode;
  }) =>
    React.createElement("div", { "data-testid": testID, "data-title": title }, trailing, children),
}));

import { ProvidersSection } from "./providers-section";

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

const vendorKeyOnly: Vendor = {
  id: "vendor-key-1",
  name: "MiniMax",
  baseUrl: "https://api.minimax.chat/anthropic",
  apiKey: "another-key",
  apiFormat: "anthropic",
  authStyle: "anthropic-api-key",
  exposedModelIds: ["minimax-1"],
};

const codexVendor: Vendor = {
  id: "codex-vendor-1",
  name: "CodexVendor",
  baseUrl: "https://codex.example.com",
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

describe("ProvidersSection (Helm master-detail)", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    configState.config = null;
    configState.isLoading = false;
    isCompactState.value = false;
    patchConfigMock.mockReset();
    patchConfigMock.mockResolvedValue(undefined);
    onEditVendorMock.mockReset();
    onOpenSyncMock.mockReset();
    alertMock.mockReset();
    alertCalls.length = 0;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  function render(override?: {
    onEditVendor?: (cli: "claude" | "codex", vendor?: Vendor) => void;
    onOpenSync?: () => void;
  }): void {
    act(() => {
      root?.render(
        <ProvidersSection
          serverId="server-1"
          onEditVendor={override?.onEditVendor ?? onEditVendorMock}
          onOpenSync={override?.onOpenSync ?? onOpenSyncMock}
        />,
      );
    });
  }

  it("renders Claude Code and Codex with their vendor counts", () => {
    configState.config = makeConfig([vendorCcSwitch, vendorKeyOnly], [codexVendor]);

    render();

    const text = container?.textContent ?? "";
    expect(text).toContain("Claude Code");
    expect(text).toContain("Codex");
    // vendor count labels
    expect(text).toContain("2 个供应商"); // claude
    expect(text).toContain("1 个供应商"); // codex
  });

  it("shows vendor list for the selected CLI (Claude by default) with name, url, and badges", () => {
    configState.config = makeConfig([vendorCcSwitch], []);

    render();

    const text = container?.textContent ?? "";
    expect(text).toContain("质谱glm5.0");
    expect(text).toContain("https://api.z.ai/api/anthropic");
    expect(text).toContain("cc switch");
    expect(text).toContain("key");
  });

  it("shows the direct-connect default item in the vendor area", () => {
    configState.config = makeConfig([], []);

    render();

    const text = container?.textContent ?? "";
    expect(text).toContain("直连 · Anthropic 官方登录");
    expect(text).toContain("默认");
    expect(text).toContain("不走中转站");
  });

  it("shows + add vendor button", () => {
    configState.config = makeConfig([], []);

    render();

    const text = container?.textContent ?? "";
    expect(text).toContain("＋ 新增供应商");
  });

  it("clicking + add vendor calls onEditVendor with no vendor argument", () => {
    configState.config = makeConfig([], []);

    render();

    const addBtn = Array.from(container?.querySelectorAll<HTMLElement>("button") ?? []).find(
      (btn) => btn.textContent?.includes("＋ 新增供应商"),
    );
    expect(addBtn).toBeTruthy();

    act(() => {
      addBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(onEditVendorMock).toHaveBeenCalledTimes(1);
    expect(onEditVendorMock).toHaveBeenCalledWith("claude", undefined);
  });

  it("delete vendor confirm → patchConfig removes the vendor", async () => {
    // Use compact=true so action buttons (edit/delete) are always visible (no hover needed)
    isCompactState.value = true;
    configState.config = makeConfig([vendorCcSwitch, vendorKeyOnly], []);

    render();

    // Delete button is now visible (isCompact=true → showActions=true)
    const deleteBtn = container?.querySelector<HTMLElement>(
      '[data-testid="delete-vendor-vendor-cc-1"]',
    );
    expect(deleteBtn).not.toBeNull();

    act(() => {
      deleteBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    // The component calls Alert.alert with confirmation buttons
    expect(alertMock).toHaveBeenCalledTimes(1);

    // Simulate user pressing the destructive confirm button
    const calls = alertMock.mock.calls[0] as [string, string, AlertButton[]];
    const destructiveBtn = calls[2]?.find((b) => b.style === "destructive");
    expect(destructiveBtn).toBeDefined();

    await act(async () => {
      destructiveBtn?.onPress?.();
    });

    expect(patchConfigMock).toHaveBeenCalledTimes(1);
    expect(patchConfigMock).toHaveBeenCalledWith({
      vendors: { claude: [vendorKeyOnly] },
    });
  });

  it("clicking sync button calls onOpenSync", () => {
    configState.config = makeConfig([], []);

    render();

    const syncBtn = Array.from(container?.querySelectorAll<HTMLElement>("button") ?? []).find(
      (btn) => btn.textContent?.includes("一键同步"),
    );
    expect(syncBtn).toBeTruthy();

    act(() => {
      syncBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenSyncMock).toHaveBeenCalledTimes(1);
  });

  it("shows model count in vendor row", () => {
    configState.config = makeConfig([vendorCcSwitch], []);

    render();

    const text = container?.textContent ?? "";
    // exposedModelIds has 2 items
    expect(text).toContain("2 模型");
  });
});
