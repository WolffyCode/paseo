import { describe, expect, it } from "vitest";
import { resolveContextUsage, shouldShowContextPlaceholder } from "./context-window-meter.utils";

describe("context window meter model", () => {
  it("returns a complete percentage snapshot only when both token values are valid", () => {
    expect(resolveContextUsage(200_000, 72_000)).toEqual({
      maxTokens: 200_000,
      usedTokens: 72_000,
      percentage: 36,
    });
    expect(resolveContextUsage(null, 72_000)).toBeNull();
    expect(resolveContextUsage(200_000, null)).toBeNull();
    expect(resolveContextUsage(0, 0)).toBeNull();
  });

  it("keeps the unavailable desktop entry clickable without changing the mobile empty state", () => {
    expect(shouldShowContextPlaceholder({ pending: false, showUnavailable: true })).toBe(true);
    expect(shouldShowContextPlaceholder({ pending: true, showUnavailable: false })).toBe(true);
    expect(shouldShowContextPlaceholder({ pending: false, showUnavailable: false })).toBe(false);
  });
});
