import { describe, expect, it } from "vitest";
import { nextZoomFactor, zoomPercent } from "./zoom";

describe("nextZoomFactor", () => {
  it("steps through Chrome's preset zoom levels", () => {
    expect(nextZoomFactor(1, 1)).toBe(1.1);
    expect(nextZoomFactor(1.1, 1)).toBe(1.25);
    expect(nextZoomFactor(1, -1)).toBe(0.9);
    expect(nextZoomFactor(0.5, -1)).toBeCloseTo(1 / 3);
  });

  it("moves to the nearest step from a factor between steps", () => {
    expect(nextZoomFactor(1.2, 1)).toBe(1.25);
    expect(nextZoomFactor(1.2, -1)).toBe(1.1);
  });

  it("stays at the smallest and largest steps", () => {
    expect(nextZoomFactor(0.25, -1)).toBe(0.25);
    expect(nextZoomFactor(5, 1)).toBe(5);
  });

  it("treats float noise from the page as the step itself", () => {
    expect(nextZoomFactor(1.0999999, 1)).toBe(1.25);
  });
});

describe("zoomPercent", () => {
  it("rounds to a whole percentage", () => {
    expect(zoomPercent(1 / 3)).toBe(33);
    expect(zoomPercent(1.25)).toBe(125);
  });
});
