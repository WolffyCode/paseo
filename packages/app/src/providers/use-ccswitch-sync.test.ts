/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockSyncCcSwitch = vi.fn();
let mockSupportsVendors = true;

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({ syncCcSwitch: mockSyncCcSwitch }),
}));

vi.mock("@/providers/use-three-layer-vendors", () => ({
  useSupportsThreeLayerVendors: () => mockSupportsVendors,
}));

import { useCcSwitchSync } from "./use-ccswitch-sync";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const claudeItems = [
  {
    ccSwitchId: "cc-1",
    name: "Z.AI GLM",
    baseUrl: "https://api.z.ai/anthropic",
    status: "new" as const,
    modelCount: 3,
  },
  {
    ccSwitchId: "cc-2",
    name: "MiniMax",
    baseUrl: "https://api.minimax.chat/anthropic",
    status: "update" as const,
    modelCount: 2,
  },
  {
    ccSwitchId: "cc-3",
    name: "OldVendor",
    baseUrl: "https://old.example.com",
    status: "same" as const,
    modelCount: 1,
  },
];

const codexItems = [
  {
    ccSwitchId: "co-1",
    name: "CodexRelay",
    baseUrl: "https://codex.example.com",
    status: "new" as const,
    modelCount: 4,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCcSwitchSync", () => {
  beforeEach(() => {
    mockSyncCcSwitch.mockReset();
    mockSupportsVendors = true; // default: capability present
  });

  it("open=true fetches both CLIs concurrently and populates itemsByCli + countByCli", async () => {
    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string; apply?: boolean }) => {
      if (params.cli === "claude") return { items: claudeItems };
      if (params.cli === "codex") return { items: codexItems };
      return { items: [] };
    });

    const { result } = renderHook(() => useCcSwitchSync("server-1", true));

    // Initially loading
    expect(result.current.state.kind).toBe("loading");

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    // Both CLIs called with apply:false
    expect(mockSyncCcSwitch).toHaveBeenCalledTimes(2);
    expect(mockSyncCcSwitch).toHaveBeenCalledWith({ cli: "claude", apply: false });
    expect(mockSyncCcSwitch).toHaveBeenCalledWith({ cli: "codex", apply: false });

    expect(result.current.itemsByCli.claude).toHaveLength(3);
    expect(result.current.itemsByCli.codex).toHaveLength(1);
    expect(result.current.countByCli).toEqual({ claude: 3, codex: 1 });
  });

  it("default selection: new+update items checked, same items unchecked", async () => {
    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string; apply?: boolean }) => {
      if (params.cli === "claude") return { items: claudeItems };
      return { items: codexItems };
    });

    const { result } = renderHook(() => useCcSwitchSync("server-1", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    // cc-1 (new) and cc-2 (update) should be selected
    expect(result.current.selectedIds.has("cc-1")).toBe(true);
    expect(result.current.selectedIds.has("cc-2")).toBe(true);
    // cc-3 (same) should NOT be selected
    expect(result.current.selectedIds.has("cc-3")).toBe(false);
    // co-1 (new, codex) should also be selected
    expect(result.current.selectedIds.has("co-1")).toBe(true);
  });

  it("toggle and selectAll modify selectedIds; summary reflects selectedCli tab", async () => {
    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string; apply?: boolean }) => {
      if (params.cli === "claude") return { items: claudeItems };
      return { items: codexItems };
    });

    const { result } = renderHook(() => useCcSwitchSync("server-1", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    // Initial summary for claude tab: 2 selected (cc-1, cc-2), total=3, newCount=1, updateCount=1
    expect(result.current.summary).toEqual({
      selected: 2,
      total: 3,
      newCount: 1,
      updateCount: 1,
    });

    // Toggle cc-3 (same → select it)
    act(() => {
      result.current.toggle("cc-3");
    });
    expect(result.current.selectedIds.has("cc-3")).toBe(true);
    expect(result.current.summary.selected).toBe(3);

    // Toggle cc-1 (new → deselect)
    act(() => {
      result.current.toggle("cc-1");
    });
    expect(result.current.selectedIds.has("cc-1")).toBe(false);
    expect(result.current.summary.selected).toBe(2);

    // selectAll(claude, false) → deselects all claude items
    act(() => {
      result.current.selectAll("claude", false);
    });
    expect(result.current.selectedIds.has("cc-1")).toBe(false);
    expect(result.current.selectedIds.has("cc-2")).toBe(false);
    expect(result.current.selectedIds.has("cc-3")).toBe(false);
    expect(result.current.summary.selected).toBe(0);

    // selectAll(claude, true) → selects all claude items
    act(() => {
      result.current.selectAll("claude", true);
    });
    expect(result.current.selectedIds.has("cc-1")).toBe(true);
    expect(result.current.selectedIds.has("cc-2")).toBe(true);
    expect(result.current.selectedIds.has("cc-3")).toBe(true);
    expect(result.current.summary.selected).toBe(3);

    // Switch to codex tab — summary reflects codex
    act(() => {
      result.current.setSelectedCli("codex");
    });
    expect(result.current.summary).toEqual({
      selected: 1,
      total: 1,
      newCount: 1,
      updateCount: 0,
    });
  });

  it("apply() calls syncCcSwitch(apply:true) per CLI that has selections with correct selectedIds", async () => {
    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string; apply?: boolean }) => {
      if (params.cli === "claude") return { items: claudeItems };
      if (params.cli === "codex") return { items: codexItems };
      return { items: [], applied: true };
    });

    const { result } = renderHook(() => useCcSwitchSync("server-1", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    // Reset call count after initial fetch
    mockSyncCcSwitch.mockClear();
    mockSyncCcSwitch.mockResolvedValue({ items: [], applied: true });

    // Deselect cc-2 so only cc-1 remains for claude
    act(() => {
      result.current.toggle("cc-2");
    });

    let applyResult: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      applyResult = await result.current.apply();
    });

    expect(applyResult).toEqual({ ok: true });

    // Should call apply for both CLIs that have selections
    const calls = mockSyncCcSwitch.mock.calls;
    const claudeApplyCall = calls.find((c) => c[0].cli === "claude" && c[0].apply === true);
    const codexApplyCall = calls.find((c) => c[0].cli === "codex" && c[0].apply === true);

    expect(claudeApplyCall).toBeDefined();
    expect(claudeApplyCall?.[0].selectedIds).toContain("cc-1");
    expect(claudeApplyCall?.[0].selectedIds).not.toContain("cc-2");

    expect(codexApplyCall).toBeDefined();
    expect(codexApplyCall?.[0].selectedIds).toContain("co-1");
  });

  // -----------------------------------------------------------------------
  // I3 gate: threeLayerVendors capability check
  // -----------------------------------------------------------------------

  it("threeLayerVendors ABSENT: does not call syncCcSwitch and reports error", async () => {
    mockSupportsVendors = false;

    const { result } = renderHook(() => useCcSwitchSync("server-old", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("error");
    });

    // syncCcSwitch must NOT have been fired against an old daemon
    expect(mockSyncCcSwitch).not.toHaveBeenCalled();

    const errorMsg = (result.current.state as { kind: "error"; message: string }).message;
    expect(errorMsg).toMatch(/Update the host/i);
  });

  it("threeLayerVendors ABSENT: apply() returns error without calling syncCcSwitch", async () => {
    mockSupportsVendors = false;

    const { result } = renderHook(() => useCcSwitchSync("server-old", false));

    let applyResult: { ok: boolean; error?: string } | undefined;
    await act(async () => {
      applyResult = await result.current.apply();
    });

    expect(applyResult?.ok).toBe(false);
    expect(applyResult?.error).toMatch(/Update the host/i);
    expect(mockSyncCcSwitch).not.toHaveBeenCalled();
  });

  it("threeLayerVendors PRESENT: normal fetch works as before", async () => {
    mockSupportsVendors = true;

    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string }) => {
      if (params.cli === "claude") return { items: claudeItems };
      return { items: codexItems };
    });

    const { result } = renderHook(() => useCcSwitchSync("server-new", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    expect(mockSyncCcSwitch).toHaveBeenCalledTimes(2);
    expect(result.current.itemsByCli.claude).toHaveLength(3);
  });

  it("syncCcSwitch error → state.kind === 'error'", async () => {
    mockSyncCcSwitch.mockRejectedValue(new Error("Network timeout"));

    const { result } = renderHook(() => useCcSwitchSync("server-1", true));

    await waitFor(() => {
      expect(result.current.state.kind).toBe("error");
    });

    expect((result.current.state as { kind: "error"; message: string }).message).toContain(
      "Network timeout",
    );
  });

  it("re-open (open false→true) refetches both CLIs", async () => {
    mockSyncCcSwitch.mockImplementation(async (params: { cli?: string }) => {
      if (params.cli === "claude") return { items: claudeItems };
      return { items: codexItems };
    });

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useCcSwitchSync("server-1", open),
      { initialProps: { open: true } },
    );

    await waitFor(() => {
      expect(result.current.state.kind).toBe("ready");
    });

    const firstCallCount = mockSyncCcSwitch.mock.calls.length;
    expect(firstCallCount).toBe(2);

    // Close
    rerender({ open: false });

    // Re-open
    rerender({ open: true });

    await waitFor(() => {
      expect(mockSyncCcSwitch.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    expect(mockSyncCcSwitch.mock.calls.length).toBe(4);
  });
});
