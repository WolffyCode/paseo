// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { ensureTabHoverCss } from "./tab-hover-css";

// The web hover stylesheet is the tab strip's single paint path. This test locks both semantic colors:
// inactive hover gets the subtle chrome wash and promotes all tab foregrounds to the readable fg token.
describe("ensureTabHoverCss", () => {
  afterEach(() => document.getElementById("rp-tab-hover")?.remove());

  it("writes the supplied chrome hover and foreground tokens without a blue fallback", () => {
    ensureTabHoverCss("#f6f8fa", "#1f2328");

    expect(document.getElementById("rp-tab-hover")?.textContent).toContain(
      "background-color: #f6f8fa !important",
    );
    expect(document.getElementById("rp-tab-hover")?.textContent).toContain(
      "color: #1f2328 !important",
    );
    expect(document.getElementById("rp-tab-hover")?.textContent).toContain(
      "stroke: #1f2328 !important",
    );
  });
});
