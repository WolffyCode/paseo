import { describe, expect, it } from "vitest";
import { fixupHomePageUrl } from "./settings";

// Runs in Chromium, whose URL parser escapes a space in a host where Node's rejects it.
describe("fixupHomePageUrl in the renderer", () => {
  it("rejects a host with whitespace, as Chrome's URL fixer does", () => {
    expect(fixupHomePageUrl("two words")).toBeNull();
    expect(fixupHomePageUrl("http://two words/path")).toBeNull();
  });

  it("still escapes spaces in the path", () => {
    expect(fixupHomePageUrl("baidu.com/x y")).toBe("http://baidu.com/x%20y");
  });
});
