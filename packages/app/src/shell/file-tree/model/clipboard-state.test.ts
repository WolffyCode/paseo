import { describe, expect, it } from "vitest";
import { afterPaste, canPaste, clearClipboard, setCopy, setCut } from "./clipboard-state";

describe("setCut / setCopy / clearClipboard", () => {
  it("builds a cut clipboard entry for the given path", () => {
    expect(setCut("/work/a.ts")).toEqual({ mode: "cut", path: "/work/a.ts" });
  });

  it("builds a copy clipboard entry for the given path", () => {
    expect(setCopy("/work/a.ts")).toEqual({ mode: "copy", path: "/work/a.ts" });
  });

  it("clears the clipboard to null", () => {
    expect(clearClipboard()).toBeNull();
  });
});

describe("afterPaste", () => {
  it("clears the clipboard after pasting a cut (cut is a one-shot move)", () => {
    expect(afterPaste({ mode: "cut", path: "/work/a.ts" })).toBeNull();
  });

  it("retains the clipboard after pasting a copy (copy can paste repeatedly)", () => {
    expect(afterPaste({ mode: "copy", path: "/work/a.ts" })).toEqual({
      mode: "copy",
      path: "/work/a.ts",
    });
  });
});

describe("canPaste", () => {
  it("is true when the clipboard holds an entry", () => {
    expect(canPaste({ mode: "cut", path: "/work/a.ts" })).toBe(true);
    expect(canPaste({ mode: "copy", path: "/work/a.ts" })).toBe(true);
  });

  it("is false when the clipboard is empty", () => {
    expect(canPaste(null)).toBe(false);
  });
});
