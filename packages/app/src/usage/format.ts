import type { TFunction } from "i18next";
import { formatTokenCount } from "@/components/context-window-meter.utils";
import { formatLargestUnitDuration } from "@/utils/time";
import type { UsageDisplayAs } from "./preferences";
import type { UsageBalanceUnit } from "./types";

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function formatPct(value: number): string {
  return `${Math.round(clampPct(value))}%`;
}

/** "31%" of the window used, or "69% left" of it. */
export function formatDisplayPct(value: number, displayAs: UsageDisplayAs, t: TFunction): string {
  if (displayAs === "used") return formatPct(value);
  return t("usage.remainingValue", { value: formatPct(value) });
}

/** Milliseconds from now until `iso`, negative once it has passed; null when it is not a time. */
function msUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const untilMs = new Date(iso).getTime() - Date.now();
  return Number.isFinite(untilMs) ? untilMs : null;
}

/** When a window or balance starts over: "resets 2h", or "resetting now" once that time is due. */
export function formatResetLabel(iso: string | null | undefined, t: TFunction): string | null {
  const untilReset = msUntil(iso);
  if (untilReset === null) return null;
  if (untilReset <= 0) return t("usage.resettingNow");
  return t("usage.resetsIn", { duration: formatLargestUnitDuration(untilReset, t) });
}

/** When a window at its current pace hits its limit: "runs out 3h", or "runs out now". */
export function formatRunsOutLabel(iso: string | null | undefined, t: TFunction): string | null {
  const untilRunsOut = msUntil(iso);
  if (untilRunsOut === null) return null;
  if (untilRunsOut <= 0) return t("usage.runsOutNow");
  return t("usage.runsOutIn", { duration: formatLargestUnitDuration(untilRunsOut, t) });
}

/** A balance amount as the app's language writes it: "$1,234.50", "12,345". */
export function formatAmount(value: number, unit: UsageBalanceUnit, locale: string): string {
  switch (unit) {
    case "usd":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(value);
    case "tokens":
      return formatTokenCount(value);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
}
