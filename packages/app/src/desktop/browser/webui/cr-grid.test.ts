import { describe, expect, it } from "vitest";
import { crGridNextIndex } from "./cr-grid";

// 30 avatars in 6 columns, as settings' avatar picker lays them out.
const AVATARS = { count: 30, columns: 6 };

describe("crGridNextIndex", () => {
  it("steps left and right through the items, wrapping at the ends", () => {
    expect(crGridNextIndex({ ...AVATARS, index: 3, key: "ArrowRight" })).toBe(4);
    expect(crGridNextIndex({ ...AVATARS, index: 29, key: "ArrowRight" })).toBe(0);
    expect(crGridNextIndex({ ...AVATARS, index: 0, key: "ArrowLeft" })).toBe(29);
  });

  it("moves a row up or down, wrapping to the same column", () => {
    expect(crGridNextIndex({ ...AVATARS, index: 2, key: "ArrowDown" })).toBe(8);
    expect(crGridNextIndex({ ...AVATARS, index: 27, key: "ArrowDown" })).toBe(3);
    expect(crGridNextIndex({ ...AVATARS, index: 2, key: "ArrowUp" })).toBe(26);
  });

  it("goes through a short last row the way cr-grid does", () => {
    // 8 items in 3 columns: the last row holds items 6 and 7.
    const grid = { count: 8, columns: 3 };
    expect(crGridNextIndex({ ...grid, index: 4, key: "ArrowDown" })).toBe(7);
    // Nothing below the last column: Down goes back to the top of it.
    expect(crGridNextIndex({ ...grid, index: 5, key: "ArrowDown" })).toBe(2);
    expect(crGridNextIndex({ ...grid, index: 7, key: "ArrowDown" })).toBe(1);
    expect(crGridNextIndex({ ...grid, index: 1, key: "ArrowUp" })).toBe(7);
    expect(crGridNextIndex({ ...grid, index: 2, key: "ArrowUp" })).toBe(5);
  });
});
