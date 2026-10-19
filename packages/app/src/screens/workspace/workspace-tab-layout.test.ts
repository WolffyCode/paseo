import { describe, expect, it } from "vitest";
import {
  computeWorkspaceTabLayout,
  retainWorkspaceTabMeasuredWidth,
} from "@/screens/workspace/workspace-tab-layout";

const metrics = {
  rowHorizontalInset: 0,
  actionsReservedWidth: 120,
  rowPaddingHorizontal: 8,
  tabGap: 4,
  minTabWidth: 64,
  maxTabWidth: 160,
  tabIconWidth: 14,
  tabContentGap: 4,
  tabHorizontalPadding: 8,
  closeButtonWidth: 0,
};

describe("computeWorkspaceTabLayout", () => {
  it("shares spare row width up to the maximum instead of leaving short tabs at their label width", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelWidths: [56, 70, 49],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([160, 160, 160]);
  });

  it("grows a short label into spare width without crossing the maximum", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 300,
      tabLabelWidths: [29, 52],
      metrics: { ...metrics, actionsReservedWidth: 36 },
    });
    expect(result.items).toEqual([
      { width: 117, showLabel: true },
      { width: 127, showLabel: true },
    ]);
    expect(result.requiresHorizontalScrollFallback).toBe(false);
  });

  it("sizes a single tab between the minimum and maximum from its content", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelWidths: [105],
      metrics,
    });

    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([160]);
  });

  it("keeps natural widths when the row cannot hold them, and scrolls", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 460,
      tabLabelWidths: [168, 84, 56],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([160, 118, 90]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("caps long tabs at the maximum width", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1004,
      tabLabelWidths: [280, 280, 280, 280],
      metrics: {
        ...metrics,
        actionsReservedWidth: 44,
        rowPaddingHorizontal: 0,
        tabGap: 0,
      },
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([160, 160, 160, 160]);
  });

  it("keeps the readable width when the row is exactly full", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 788,
      tabLabelWidths: [98, 98, 98, 98],
      metrics,
    });

    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([160, 160, 160, 160]);
  });

  it("scrolls at the readable width instead of shrinking labels to the clickable minimum", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 403,
      tabLabelWidths: [98, 98, 98, 98],
      metrics,
    });

    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([132, 132, 132, 132]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("returns empty layout details when there are no tabs", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelWidths: [],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toEqual([]);
  });

  it("uses rendered label width rather than character count", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelWidths: [68, 104],
      metrics,
    });

    expect(result.items.map((item) => item.width)).toEqual([160, 160]);
  });

  it("stops growing at the column-3 cap instead of stretching short tabs across the row", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelWidths: [56, 70],
      metrics: { ...metrics, maxTabWidth: 240 },
    });

    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([240, 240]);
  });

  it("scrolls at the readable width instead of shrinking labels to fit the row", () => {
    const columnMetrics = { ...metrics, minTabWidth: 90, maxTabWidth: 240 };
    const fitting = computeWorkspaceTabLayout({
      viewportWidth: 700,
      tabLabelWidths: [80, 80, 80],
      metrics: columnMetrics,
    });
    const overflowing = computeWorkspaceTabLayout({
      viewportWidth: 500,
      tabLabelWidths: [80, 80, 80, 80, 80],
      metrics: { ...columnMetrics, actionsReservedWidth: 36 },
    });

    expect(fitting.requiresHorizontalScrollFallback).toBe(false);
    expect(overflowing.requiresHorizontalScrollFallback).toBe(true);
    expect(overflowing.items.map((item) => item.width)).toEqual([114, 114, 114, 114, 114]);
    expect(overflowing.items.every((item) => item.showLabel)).toBe(true);
  });
});

describe("retainWorkspaceTabMeasuredWidth", () => {
  it("retains the last usable width while a retained panel is hidden", () => {
    expect(retainWorkspaceTabMeasuredWidth(720, 0)).toBe(720);
  });

  it("accepts the next usable layout width", () => {
    expect(retainWorkspaceTabMeasuredWidth(720, 640)).toBe(640);
  });
});
