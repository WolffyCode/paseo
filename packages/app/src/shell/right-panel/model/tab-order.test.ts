import { describe, expect, it } from "vitest";
import { placeTabAtDropIndex } from "./tab-order";

// placeTabAtDropIndex is the drag-reorder landing rule: pull the moving tab out, drop it back at the
// target index among the remaining tabs. No fixed first slot; the drop index is clamped to the edges.

describe("placeTabAtDropIndex", () => {
  // Dropping at 0 moves a tab to the front (no pinned first position).
  it("moves a tab to the front", () => {
    expect(placeTabAtDropIndex(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  // Dropping into the middle lands the tab between the remaining tabs in order.
  it("moves a tab into the middle", () => {
    expect(placeTabAtDropIndex(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  });

  // Dropping past the end clamps to the last position rather than overshooting.
  it("clamps an over-large drop index to the end", () => {
    expect(placeTabAtDropIndex(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
  });

  // A negative drop index clamps to the front.
  it("clamps a negative drop index to the front", () => {
    expect(placeTabAtDropIndex(["a", "b", "c"], "b", -5)).toEqual(["b", "a", "c"]);
  });

  // An unknown moving id changes nothing (defensive; a real drag always moves an existing tab).
  it("returns the order unchanged for an unknown id", () => {
    expect(placeTabAtDropIndex(["a", "b", "c"], "zzz", 0)).toEqual(["a", "b", "c"]);
  });
});
