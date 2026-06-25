/**
 * @vitest-environment jsdom
 */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — must run before any imports from the module graph
// ---------------------------------------------------------------------------

const mockApply = vi.fn();
const mockToggle = vi.fn();
const mockSelectAll = vi.fn();
const mockSetSelectedCli = vi.fn();

const defaultHookResult = {
  state: { kind: "ready" as const },
  selectedCli: "claude" as const,
  setSelectedCli: mockSetSelectedCli,
  itemsByCli: {
    claude: [
      {
        ccSwitchId: "cc-1",
        name: "Z.AI",
        baseUrl: "https://api.z.ai/anthropic",
        status: "new" as const,
        modelCount: 3,
      },
    ],
    codex: [],
  },
  countByCli: { claude: 1, codex: 0 },
  selectedIds: new Set(["cc-1"]),
  toggle: mockToggle,
  selectAll: mockSelectAll,
  summary: { selected: 1, total: 1, newCount: 1, updateCount: 0 },
  apply: mockApply,
  isApplying: false,
};

vi.mock("@/providers/use-ccswitch-sync", () => ({
  useCcSwitchSync: () => defaultHookResult,
}));

// Mock AdaptiveModalSheet: render children + footer inline so we can assert on them
vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    visible?: boolean;
    onClose?: () => void;
    header?: unknown;
    scrollable?: boolean;
    desktopMaxWidth?: number;
  }) => (
    <div>
      <div data-testid="sheet-body">{children}</div>
      {footer ? <div data-testid="sheet-footer">{footer}</div> : null}
    </div>
  ),
}));

// Mock Button component
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    loading?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
}));

// Mock react-i18next so t() returns key with interpolated vars
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
          fontSize: { xs: 11, sm: 13 },
          fontWeight: { medium: "500", semibold: "600", bold: "700" },
          borderRadius: { sm: 4, md: 6, lg: 8 },
          colors: {
            foreground: "#fff",
            foregroundMuted: "#aaa",
            border: "#444",
            surface2: "#222",
            accent: "#0a84ff",
            palette: { red: { 300: "#ff6b6b" } },
          },
        };
        return RNStyleSheet.create(factory(theme) as Parameters<typeof RNStyleSheet.create>[0]);
      },
    },
  };
});

// Mock layout hook
vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { CcSwitchSyncModal } from "./ccswitch-sync-modal";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CcSwitchSyncModal — apply failure", () => {
  it("shows error text and keeps modal open when apply() returns { ok: false }", async () => {
    mockApply.mockResolvedValue({ ok: false, error: "boom" });
    const onClose = vi.fn();

    render(<CcSwitchSyncModal visible serverId="s1" onClose={onClose} />);

    // Click the import button (matches i18n key text)
    const importBtn = screen.getByRole("button", {
      name: /settings\.vendors\.sync\.importButton/,
    });
    await act(async () => {
      fireEvent.click(importBtn);
    });

    await waitFor(() => {
      // Error text should appear
      expect(screen.getByText(/boom/)).toBeTruthy();
    });

    // Modal must NOT have closed
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes modal when apply() returns { ok: true }", async () => {
    mockApply.mockResolvedValue({ ok: true });
    const onClose = vi.fn();

    render(<CcSwitchSyncModal visible serverId="s1" onClose={onClose} />);

    const importBtn = screen.getByRole("button", {
      name: /settings\.vendors\.sync\.importButton/,
    });
    await act(async () => {
      fireEvent.click(importBtn);
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // No error text
    expect(screen.queryByText(/boom/)).toBeNull();
  });
});
