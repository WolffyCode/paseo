import type { TFunction } from "i18next";

/**
 * Compact, locale-aware "time ago" for the sidebar file tree (Codex-style).
 * No "ago"/"前" suffix — just the largest unit: "刚刚" / "5分钟" / "2小时" / "3天" /
 * "1周" / "2个月" / "1年" (and the equivalent terse forms per locale).
 * `n` (not `count`) is used for interpolation to avoid i18next pluralization.
 */
export function formatTimeAgoShort(date: Date, t: TFunction): string {
  const diffSec = Math.max(0, Math.floor((new Date().getTime() - date.getTime()) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return t("time.short.justNow");
  if (diffHour < 1) return t("time.short.minutes", { n: diffMin });
  if (diffDay < 1) return t("time.short.hours", { n: diffHour });
  if (diffDay < 7) return t("time.short.days", { n: diffDay });
  if (diffDay < 30) return t("time.short.weeks", { n: Math.floor(diffDay / 7) });
  if (diffDay < 365) return t("time.short.months", { n: Math.floor(diffDay / 30) });
  return t("time.short.years", { n: Math.floor(diffDay / 365) });
}

/**
 * Format a date as a human-friendly relative time string
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Jan 15"
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 10) {
    return "just now";
  }

  if (diffMin < 1) {
    return `${diffSec}s ago`;
  }

  if (diffHour < 1) {
    return `${diffMin}m ago`;
  }

  if (diffDay < 1) {
    return `${diffHour}h ago`;
  }

  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }

  // For older dates, show abbreviated month and day
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Cached Intl formatter. Explicitly carrying `hourCycle` from the resolved
// options is what makes the runtime respect the user's OS-level 12h/24h
// preference rather than the locale's default cycle.
let cachedTimeFormatter: Intl.DateTimeFormat | null = null;
function getTimeFormatter(): Intl.DateTimeFormat {
  if (cachedTimeFormatter) return cachedTimeFormatter;
  const resolved = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).resolvedOptions();
  cachedTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: resolved.hourCycle,
  });
  return cachedTimeFormatter;
}

/**
 * Format a chat-message timestamp for hover-revealed UI.
 * - Same day: "10:11 PM" or "22:11" depending on user preference
 * - Within ~6 days: "Wednesday 10:11 PM"
 * - Older: "14 May 2026, 10:11 PM"
 */
export function formatMessageTimestamp(date: Date, now: Date = new Date()): string {
  const time = getTimeFormatter().format(date);

  if (isSameLocalDay(date, now)) {
    return time;
  }

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
    return `${weekday} ${time}`;
  }

  const dateLabel = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dateLabel}, ${time}`;
}

/**
 * Format a duration as a compact human-readable string.
 * - 0-60s: whole seconds ("47s")
 * - Minutes/hours: integers only ("2m 12s", "1h 5m")
 */
export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "0s";
  }
  const totalSeconds = durationMs / 1000;

  if (totalSeconds < 60) {
    return `${Math.floor(totalSeconds)}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = Math.floor(totalSeconds) % 60;
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${seconds}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
}
