import { describe, expect, it } from "vitest";
import { resolveTabStripWheelDelta } from "./tab-strip-scroll";

// The tab strip accepts mouse wheels and trackpads, so these tests lock its axis selection and DOM delta
// normalization without requiring a rendered component.
describe("resolveTabStripWheelDelta", () => {
  it("maps a vertical pixel wheel gesture onto horizontal movement with its direction intact", () => {
    expect(
      resolveTabStripWheelDelta({ deltaX: 0, deltaY: 42, deltaMode: 0, viewportWidth: 320 }),
    ).toBe(42);
    expect(
      resolveTabStripWheelDelta({ deltaX: 0, deltaY: -18, deltaMode: 0, viewportWidth: 320 }),
    ).toBe(-18);
  });

  it("keeps the dominant horizontal trackpad delta instead of adding both axes", () => {
    expect(
      resolveTabStripWheelDelta({ deltaX: 35, deltaY: 8, deltaMode: 0, viewportWidth: 320 }),
    ).toBe(35);
  });

  it("normalizes line and page wheel units to usable horizontal pixel distances", () => {
    expect(
      resolveTabStripWheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1, viewportWidth: 320 }),
    ).toBe(48);
    expect(
      resolveTabStripWheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2, viewportWidth: 320 }),
    ).toBe(320);
  });
});
