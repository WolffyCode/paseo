import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react-native";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { ProviderUsageTooltipSection } from "@/provider-usage/tooltip-section";
import { useProviderUsage } from "@/provider-usage/use-provider-usage";
import {
  formatTokenCount,
  resolveContextUsage,
  shouldShowContextPlaceholder,
} from "./context-window-meter.utils";
import { getDesktopRuntimePopoverSpec } from "@/composer/desktop-composer-spec";

interface ContextWindowMeterProps {
  maxTokens: number | null;
  usedTokens: number | null;
  totalCostUsd?: number | null;
  showPercentage?: boolean;
  /** Prefix the desktop runtime control with a compact localized label. */
  showLabel?: boolean;
  serverId?: string;
  /** The Paseo provider key, e.g. "claude", "gemini", "codex" */
  provider?: string | null;
  /** Reserve the meter footprint and show a loading ring while usage is pending. */
  pending?: boolean;
  /** Keep the desktop runtime entry visible as a clickable unavailable state. */
  showUnavailable?: boolean;
}

const SVG_SIZE = 14;
const COMPACT_SVG_SIZE = 12;
const CENTER = SVG_SIZE / 2;
const COMPACT_CENTER = COMPACT_SVG_SIZE / 2;
const RADIUS = 6;
const COMPACT_RADIUS = 5;
const STROKE_WIDTH = 2;
const COMPACT_STROKE_WIDTH = 1.75;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COMPACT_CIRCUMFERENCE = 2 * Math.PI * COMPACT_RADIUS;
const EMPTY_OPTIONS: ComboboxOption[] = [];
const CONTEXT_POPOVER_SPEC = getDesktopRuntimePopoverSpec("context");

function noop() {}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function resolveContextMeterIsCompact(isCompactFormFactor: boolean): boolean {
  return isCompactFormFactor && !isWeb;
}

function shouldRenderDesktopContextControl(showLabel: boolean, isCompact: boolean): boolean {
  return showLabel && !isCompact;
}

function formatSessionCost(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

function getMeterColors(
  percentage: number,
  theme: ReturnType<typeof useUnistyles>["theme"],
): { progress: string; track: string } {
  const track = theme.colors.surface3;
  if (percentage > 90) {
    return { progress: theme.colors.destructive, track };
  }
  if (percentage >= 70) {
    return { progress: theme.colors.palette.amber[500], track };
  }
  return { progress: theme.colors.foregroundMuted, track };
}

function getMeterGeometry(showPercentage: boolean) {
  if (showPercentage) {
    return {
      svgSize: COMPACT_SVG_SIZE,
      center: COMPACT_CENTER,
      radius: COMPACT_RADIUS,
      strokeWidth: COMPACT_STROKE_WIDTH,
      circumference: COMPACT_CIRCUMFERENCE,
      containerStyle: styles.containerWithLabel,
    };
  }
  return {
    svgSize: SVG_SIZE,
    center: CENTER,
    radius: RADIUS,
    strokeWidth: STROKE_WIDTH,
    circumference: CIRCUMFERENCE,
    containerStyle: styles.container,
  };
}

function PendingContextWindowMeterContent({
  geometry,
  showLabel,
  showPercentage,
}: {
  geometry: ReturnType<typeof getMeterGeometry>;
  showLabel: boolean;
  showPercentage: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  return (
    <>
      {showLabel ? <Text style={styles.controlLabel}>{t("contextWindow.shortLabel")}</Text> : null}
      {!showLabel ? (
        <Svg
          width={geometry.svgSize}
          height={geometry.svgSize}
          viewBox={`0 0 ${geometry.svgSize} ${geometry.svgSize}`}
          style={styles.svg}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Circle
            cx={geometry.center}
            cy={geometry.center}
            r={geometry.radius}
            fill="none"
            stroke={theme.colors.surface3}
            strokeWidth={geometry.strokeWidth}
          />
        </Svg>
      ) : null}
      {showPercentage ? <Text style={styles.percentageLabel}>--</Text> : null}
      {showLabel ? <ChevronDown size={13} color={theme.colors.foregroundMuted} /> : null}
    </>
  );
}

function DesktopUsageProgress({ percentage }: { percentage: number }) {
  const progressStyle = useMemo(
    () => [styles.desktopUsageProgress, { width: `${percentage}%` as `${number}%` }],
    [percentage],
  );
  return <View style={progressStyle} />;
}

export function ContextWindowMeter({
  maxTokens,
  usedTokens,
  totalCostUsd,
  showPercentage = false,
  showLabel = false,
  serverId,
  provider,
  pending = false,
  showUnavailable = false,
}: ContextWindowMeterProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isCompactFormFactor = useIsCompactFormFactor();
  const isCompact = resolveContextMeterIsCompact(isCompactFormFactor);
  const anchorRef = useRef<View>(null);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const { view: providerUsageView, refresh: refreshProviderUsage } = useProviderUsage(
    serverId ?? null,
    { enabled: isTooltipOpen },
  );
  const usage = resolveContextUsage(maxTokens, usedTokens);
  const handleTooltipOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsTooltipOpen(nextOpen);
      if (nextOpen) {
        void refreshProviderUsage();
      }
    },
    [refreshProviderUsage],
  );
  const handleDesktopPress = useCallback(() => {
    handleTooltipOpenChange(!isTooltipOpen);
  }, [handleTooltipOpenChange, isTooltipOpen]);

  const geometry = getMeterGeometry(showPercentage);
  const controlStyle = showLabel ? styles.containerWithLabel : geometry.containerStyle;
  const desktopControlStyle = useCallback(
    ({ hovered = false, pressed }: { hovered?: boolean; pressed: boolean }) => [
      styles.containerWithLabel,
      hovered ? styles.containerWithLabelHovered : null,
      pressed || isTooltipOpen ? styles.containerWithLabelOpen : null,
    ],
    [isTooltipOpen],
  );

  // Keep a stable control while usage is pending; omit it only when no usage is expected.
  if (usage === null) {
    if (!shouldShowContextPlaceholder({ pending, showUnavailable })) {
      return null;
    }
    const pendingMeterContent = (
      <PendingContextWindowMeterContent
        geometry={geometry}
        showLabel={showLabel}
        showPercentage={showPercentage}
      />
    );
    if (shouldRenderDesktopContextControl(showLabel, isCompact)) {
      return (
        <>
          <ComboboxTrigger
            ref={anchorRef}
            collapsable={false}
            style={desktopControlStyle}
            onPress={handleDesktopPress}
            testID="context-window-meter"
            accessibilityRole="button"
            accessibilityLabel={t("contextWindow.shortLabel")}
          >
            {pendingMeterContent}
          </ComboboxTrigger>
          <Combobox
            options={EMPTY_OPTIONS}
            value=""
            onSelect={noop}
            searchable={false}
            open={isTooltipOpen}
            onOpenChange={handleTooltipOpenChange}
            anchorRef={anchorRef}
            desktopPlacement={CONTEXT_POPOVER_SPEC.placement}
            desktopOffset={CONTEXT_POPOVER_SPEC.offset}
            desktopWidth={CONTEXT_POPOVER_SPEC.width}
            desktopSurfaceVariant="composer"
          >
            <View>
              <View style={styles.desktopDetailHeader}>
                <Text style={styles.desktopDetailTitle}>{t("contextWindow.combinedTitle")}</Text>
              </View>
              <View style={styles.desktopUsageBlock}>
                <View style={styles.desktopUsageLabel}>
                  <Text style={styles.tooltipText}>{t("contextWindow.title")}</Text>
                  <Text style={styles.tooltipDetail}>--</Text>
                </View>
                <View style={styles.desktopUsageTrack} />
              </View>
              <View style={styles.desktopProviderUsage}>
                <ProviderUsageTooltipSection view={providerUsageView} activeProviderId={provider} />
              </View>
            </View>
          </Combobox>
        </>
      );
    }
    return <View style={controlStyle}>{pendingMeterContent}</View>;
  }

  const { maxTokens: resolvedMaxTokens, percentage, usedTokens: resolvedUsedTokens } = usage;
  const clampedPercentage = clampPercentage(percentage);
  const roundedPercentage = Math.round(percentage);
  const { svgSize, center, radius, strokeWidth, circumference } = geometry;
  const dashOffset = circumference - (clampedPercentage / 100) * circumference;
  const colors = getMeterColors(clampedPercentage, theme);
  const formattedSessionCost =
    typeof totalCostUsd === "number" ? formatSessionCost(totalCostUsd) : null;

  const accessibilityLabel = t("contextWindow.accessibility", {
    percentage: roundedPercentage,
  });
  const meterContent = (
    <>
      {showLabel ? <Text style={styles.controlLabel}>{t("contextWindow.shortLabel")}</Text> : null}
      {!showLabel ? (
        <Svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          style={styles.svg}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.track}
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.progress}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      ) : null}
      {showPercentage ? (
        <Text style={styles.percentageLabel}>{`${roundedPercentage}%`}</Text>
      ) : null}
      {showLabel ? <ChevronDown size={13} color={theme.colors.foregroundMuted} /> : null}
    </>
  );
  const detailContent = (
    <View style={styles.tooltipContent}>
      <Text style={styles.tooltipTitle}>{t("contextWindow.title")}</Text>
      <Text style={styles.tooltipText}>
        {t("contextWindow.used", { percentage: roundedPercentage })}
      </Text>
      <Text style={styles.tooltipDetail}>
        {t("contextWindow.tokens", {
          used: formatTokenCount(resolvedUsedTokens),
          max: formatTokenCount(resolvedMaxTokens),
        })}
      </Text>
      {formattedSessionCost ? (
        <Text style={styles.tooltipDetail}>
          {t("contextWindow.sessionCost", { cost: formattedSessionCost })}
        </Text>
      ) : null}
      <ProviderUsageTooltipSection view={providerUsageView} activeProviderId={provider} />
    </View>
  );
  const desktopDetailContent = (
    <View>
      <View style={styles.desktopDetailHeader}>
        <Text style={styles.desktopDetailTitle}>{t("contextWindow.combinedTitle")}</Text>
      </View>
      <View style={styles.desktopUsageBlock}>
        <View style={styles.desktopUsageLabel}>
          <Text style={styles.tooltipText}>{t("contextWindow.title")}</Text>
          <Text style={styles.tooltipDetail}>
            {t("contextWindow.tokens", {
              used: formatTokenCount(resolvedUsedTokens),
              max: formatTokenCount(resolvedMaxTokens),
            })}
          </Text>
        </View>
        <View style={styles.desktopUsageTrack}>
          <DesktopUsageProgress percentage={clampedPercentage} />
        </View>
        {formattedSessionCost ? (
          <Text style={styles.desktopUsageMeta}>
            {t("contextWindow.sessionCost", { cost: formattedSessionCost })}
          </Text>
        ) : null}
      </View>
      <View style={styles.desktopProviderUsage}>
        <ProviderUsageTooltipSection view={providerUsageView} activeProviderId={provider} />
      </View>
    </View>
  );

  if (shouldRenderDesktopContextControl(showLabel, isCompact)) {
    return (
      <>
        <ComboboxTrigger
          ref={anchorRef}
          collapsable={false}
          style={desktopControlStyle}
          onPress={handleDesktopPress}
          testID="context-window-meter"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {meterContent}
        </ComboboxTrigger>
        <Combobox
          options={EMPTY_OPTIONS}
          value=""
          onSelect={noop}
          searchable={false}
          open={isTooltipOpen}
          onOpenChange={handleTooltipOpenChange}
          anchorRef={anchorRef}
          desktopPlacement={CONTEXT_POPOVER_SPEC.placement}
          desktopOffset={CONTEXT_POPOVER_SPEC.offset}
          desktopWidth={CONTEXT_POPOVER_SPEC.width}
          desktopSurfaceVariant="composer"
        >
          {desktopDetailContent}
        </Combobox>
      </>
    );
  }

  return (
    <Tooltip
      open={isTooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      delayDuration={0}
      enabledOnDesktop
      enabledOnMobile
    >
      <TooltipTrigger asChild triggerRefProp="ref">
        <Pressable
          style={controlStyle}
          testID="context-window-meter"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {meterContent}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        {detailContent}
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  containerWithLabel: {
    minWidth: 32,
    maxWidth: 118,
    flexShrink: 1,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    paddingHorizontal: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  containerWithLabelHovered: {
    borderColor: theme.colorScheme === "dark" ? "#59635D" : "#BDC9C2",
    backgroundColor: theme.colorScheme === "dark" ? "#2B302C" : "#EBF0ED",
  },
  containerWithLabelOpen: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colorScheme === "dark" ? "#22382B" : "#E7F3EC",
  },
  svg: {
    transform: [{ rotate: "-90deg" }],
  },
  percentageLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  controlLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  tooltipContent: {
    gap: theme.spacing[1.5],
    minWidth: 200,
  },
  desktopDetailHeader: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  desktopDetailTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  desktopUsageBlock: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  desktopUsageLabel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  desktopUsageTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: theme.colors.surface2,
  },
  desktopUsageProgress: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  desktopUsageMeta: {
    marginTop: 7,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  desktopProviderUsage: {
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  tooltipTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  tooltipDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.4,
  },
}));
