import { describe, expect, it } from "vitest";
import { historyMenuIndices, historyMenuItems } from "./history-menu";

describe("historyMenuIndices", () => {
  it("lists earlier entries nearest first for the back menu", () => {
    expect(historyMenuIndices({ activeIndex: 3, entryCount: 6, direction: "back" })).toEqual([
      2, 1, 0,
    ]);
  });

  it("lists later entries nearest first for the forward menu", () => {
    expect(historyMenuIndices({ activeIndex: 3, entryCount: 6, direction: "forward" })).toEqual([
      4, 5,
    ]);
  });

  it("stops at twelve entries, as Chrome's menu does", () => {
    const indices = historyMenuIndices({ activeIndex: 20, entryCount: 21, direction: "back" });
    expect(indices).toHaveLength(12);
    expect(indices.at(-1)).toBe(8);
  });
});

describe("historyMenuItems", () => {
  it("names entries by title, else by address", () => {
    expect(
      historyMenuItems(
        {
          activeIndex: 2,
          entries: [
            { url: "https://example.com/", title: "Example Domain" },
            { url: "https://example.com/raw.txt", title: "" },
            { url: "https://example.org/", title: "Now" },
          ],
        },
        "back",
      ),
    ).toEqual([
      { id: "1", label: "https://example.com/raw.txt" },
      { id: "0", label: "Example Domain" },
    ]);
  });
});
