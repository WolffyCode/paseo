import { page } from "vitest/browser";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { StyleSheet, View } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabStripLayout } from "./tab-strip-layout";

const TAB_IDS = Array.from({ length: 12 }, (_, index) => `tab-${index}`);
const fixtureStyles = StyleSheet.create({
  tab: { width: 150, height: 28, flexShrink: 0 },
  actions: { width: 85, height: 26 },
});
const TEST_TABS = TAB_IDS.map((id) =>
  React.createElement(View, { key: id, dataSet: { tabid: id }, style: fixtureStyles.tab }),
);
const TEST_ACTIONS = React.createElement(View, { style: fixtureStyles.actions });

// Require a rendered production element while preserving a useful selector in assertion failures.
function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Expected rendered element: ${selector}`);
  }
  return element;
}

// The real-browser contract proves tabs own the only overflow region while the action cluster stays pinned.
describe("TabStripLayout overflow", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      React.act(() => root?.unmount());
    }
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
  });

  it("scrolls overflowing tabs while keeping the fixed action cluster inside the bar", async () => {
    await page.viewport(800, 600);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:420px;height:42px";
    document.body.appendChild(host);

    root = createRoot(host);
    React.act(() =>
      root?.render(
        <TabStripLayout
          focusedTabId="tab-11"
          borderColor="#d1d9e0"
          backgroundColor="#ffffff"
          actions={TEST_ACTIONS}
        >
          {TEST_TABS}
        </TabStripLayout>,
      ),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const bar = requireElement(host, "[data-rptabbar]");
    const strip = requireElement(host, "[data-rptabstrip]");
    const actions = requireElement(host, "[data-rptabactions]");
    const content = strip.firstElementChild;
    expect(content).toBeInstanceOf(HTMLElement);
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
    expect(content?.children).toHaveLength(12);
    expect(content?.querySelectorAll("[data-tabid]")).toHaveLength(12);

    const focused = requireElement(strip, '[data-tabid="tab-11"]');
    const stripBounds = strip.getBoundingClientRect();
    const focusedBounds = focused.getBoundingClientRect();
    expect(strip.scrollLeft).toBeGreaterThan(0);
    expect(focusedBounds.left).toBeGreaterThanOrEqual(stripBounds.left - 1);
    expect(focusedBounds.right).toBeLessThanOrEqual(stripBounds.right + 1);

    const barBounds = bar.getBoundingClientRect();
    const actionsBeforeWheel = actions.getBoundingClientRect();
    expect(actionsBeforeWheel.left).toBeGreaterThanOrEqual(barBounds.left);
    expect(actionsBeforeWheel.right).toBeLessThanOrEqual(barBounds.right);

    strip.scrollLeft = 0;
    const wheel = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
    strip.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(strip.scrollLeft).toBeGreaterThan(0);

    const actionsAfterWheel = actions.getBoundingClientRect();
    expect(actionsAfterWheel.left).toBe(actionsBeforeWheel.left);
    expect(actionsAfterWheel.right).toBe(actionsBeforeWheel.right);
  });
});
