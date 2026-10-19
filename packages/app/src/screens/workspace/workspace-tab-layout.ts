export type WorkspaceTabCloseButtonPolicy = "all";

export interface WorkspaceTabLayoutMetrics {
  rowHorizontalInset: number;
  actionsReservedWidth: number;
  rowPaddingHorizontal: number;
  tabGap: number;
  minTabWidth: number;
  maxTabWidth: number;
  tabIconWidth: number;
  tabContentGap: number;
  tabHorizontalPadding: number;
  closeButtonWidth: number;
}

export interface WorkspaceTabLayoutInput {
  viewportWidth: number;
  tabLabelWidths: number[];
  metrics: WorkspaceTabLayoutMetrics;
}

export interface WorkspaceTabLayoutItem {
  width: number;
  showLabel: boolean;
}

export interface WorkspaceTabLayoutResult {
  items: WorkspaceTabLayoutItem[];
  closeButtonPolicy: WorkspaceTabCloseButtonPolicy;
  requiresHorizontalScrollFallback: boolean;
}

export function retainWorkspaceTabMeasuredWidth(
  currentWidth: number,
  measuredWidth: number,
): number {
  if (measuredWidth <= 0 || Math.abs(currentWidth - measuredWidth) <= 1) {
    return currentWidth;
  }
  return measuredWidth;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput,
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelWidths.length;
  if (tabCount === 0) {
    return {
      items: [],
      closeButtonPolicy: "all",
      requiresHorizontalScrollFallback: false,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth,
  );
  const rowOverhead =
    input.metrics.rowPaddingHorizontal * 2 + Math.max(tabCount - 1, 0) * input.metrics.tabGap;
  const availableTabsWidth = Math.max(0, availableWidth - rowOverhead);
  const tabChromeWidth =
    input.metrics.tabIconWidth +
    input.metrics.tabContentGap +
    input.metrics.tabHorizontalPadding * 2 +
    input.metrics.closeButtonWidth;
  const naturalWidths = input.tabLabelWidths.map((labelWidth) =>
    clamp(tabChromeWidth + labelWidth, input.metrics.minTabWidth, input.metrics.maxTabWidth),
  );
  const naturalTotalWidth = naturalWidths.reduce((total, width) => total + width, 0);
  // Column 3 keeps each label readable. Tabs that cannot sit at their natural
  // width scroll instead of shrinking into truncated chips.
  const requiresHorizontalScrollFallback = availableTabsWidth < naturalTotalWidth;

  const maximumTotalWidth = input.metrics.maxTabWidth * tabCount;
  let resolvedWidths = naturalWidths;
  if (!requiresHorizontalScrollFallback && naturalTotalWidth < maximumTotalWidth) {
    const spareWidth = availableTabsWidth - naturalTotalWidth;
    const growCapacity = maximumTotalWidth - naturalTotalWidth;
    const widthToAdd = Math.min(spareWidth, growCapacity);
    const growRatio = widthToAdd / growCapacity;
    resolvedWidths = naturalWidths.map(
      (width) => width + (input.metrics.maxTabWidth - width) * growRatio,
    );
  }

  const roundedWidths = resolvedWidths.map((width) =>
    Math.round(clamp(width, input.metrics.minTabWidth, input.metrics.maxTabWidth)),
  );

  return {
    items: roundedWidths.map((width) => ({
      width,
      showLabel: width > tabChromeWidth,
    })),
    closeButtonPolicy: "all",
    requiresHorizontalScrollFallback,
  };
}
