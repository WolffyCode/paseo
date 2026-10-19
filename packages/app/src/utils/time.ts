import type { TFunction } from "i18next";

/**
 * How often a relative label can change, which is all a caller needs to know to keep it honest.
 * `static` means it never will again.
 */
export type RelativeTimeResolution = "minute" | "hour" | "day" | "static";

export interface RelativeTimeLabel {
  label: string;
  resolution: RelativeTimeResolution;
}

/**
 * How much room a relative label has. `prose` reads inside a sentence ("5m ago"). `compact` is for
 * a dense list where the column is understood to be a timestamp and "ago" would be the only word
 * on the line ("5m").
 */
export type RelativeTimeStyle = "prose" | "compact";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const MINUTE_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;
const DAY_MS = HOURS_PER_DAY * HOUR_MS;
/** Past a week the elapsed count stops meaning anything; the date itself is more use. */
const ABSOLUTE_AFTER_MS = DAYS_PER_WEEK * DAY_MS;

/**
 * How long ago something was, before it's worded. Both styles share this so their thresholds
 * can't drift apart; they differ only in how much room they have to say it.
 *
 * `now` and `date` read as absolutes and never take an "ago"; the counted kinds do in prose.
 *
 * Deliberately never sub-minute. A seconds label is only correct for the second it was rendered,
 * so it either lies or forces a once-a-second re-render of a list that has nothing new to say.
 * Everything under a minute is "now", which is both true and stable.
 *
 * The resolution comes back with the value so a caller can wake at the rate the label actually
 * changes instead of guessing — see `useTimeAgo`.
 */
type Age =
  | { kind: "now"; resolution: "minute" }
  | { kind: "minutes"; count: number; resolution: "minute" }
  | { kind: "hours"; count: number; resolution: "hour" }
  | { kind: "days"; count: number; resolution: "day" }
  | { kind: "date"; resolution: "static" };

function describeAge(date: Date, now: Date): Age {
  const elapsedMs = now.getTime() - date.getTime();

  if (elapsedMs < MINUTE_MS) {
    return { kind: "now", resolution: "minute" };
  }
  if (elapsedMs < HOUR_MS) {
    return { kind: "minutes", count: Math.floor(elapsedMs / MINUTE_MS), resolution: "minute" };
  }
  if (elapsedMs < DAY_MS) {
    return { kind: "hours", count: Math.floor(elapsedMs / HOUR_MS), resolution: "hour" };
  }
  if (elapsedMs < ABSOLUTE_AFTER_MS) {
    return { kind: "days", count: Math.floor(elapsedMs / DAY_MS), resolution: "day" };
  }
  return { kind: "date", resolution: "static" };
}

const RELATIVE_TIME_KEYS = {
  prose: {
    now: "time.ago.now",
    minutes: "time.ago.minutes",
    hours: "time.ago.hours",
    days: "time.ago.days",
  },
  compact: {
    now: "time.compactAgo.now",
    minutes: "time.compactAgo.minutes",
    hours: "time.compactAgo.hours",
    days: "time.compactAgo.days",
  },
} as const satisfies Record<RelativeTimeStyle, Record<Exclude<Age["kind"], "date">, string>>;

/** Every date and time shape this module prints. The app language decides the wording. */
const DATE_TIME_FORMATS = {
  monthDay: { month: "short", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  weekdayTime: { weekday: "long", hour: "numeric", minute: "2-digit" },
  dateTime: { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

type DateTimeFormatName = keyof typeof DATE_TIME_FORMATS;

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A cached formatter for `locale`, the app language as a BCP 47 tag.
 *
 * The hour cycle is read from the device's own locale instead: that is where the OS-level 12h/24h
 * preference lives, and it holds whichever language the app speaks. Carrying it explicitly is
 * what makes the runtime respect it rather than the language's default cycle.
 */
function getDateTimeFormatter(format: DateTimeFormatName, locale: string): Intl.DateTimeFormat {
  const cacheKey = `${format}:${locale}`;
  const cachedFormatter = dateTimeFormatters.get(cacheKey);
  if (cachedFormatter) return cachedFormatter;

  const deviceHourCycle = new Intl.DateTimeFormat(
    undefined,
    DATE_TIME_FORMATS.time,
  ).resolvedOptions().hourCycle;
  const formatter = new Intl.DateTimeFormat(locale, {
    ...DATE_TIME_FORMATS[format],
    hourCycle: deviceHourCycle,
  });
  dateTimeFormatters.set(cacheKey, formatter);
  return formatter;
}

/**
 * A human-friendly relative time in the app language, with the resolution it changes at.
 * `locale` is the app language as a BCP 47 tag; it words the date once the age passes a week.
 * English prose: "just now", "5m ago", "2h ago", "3d ago", "Jan 15".
 * English compact: "now", "5m", "2h", "3d", "Jan 15".
 */
export function describeRelativeTime(
  date: Date,
  style: RelativeTimeStyle,
  t: TFunction,
  locale: string,
  now: Date = new Date(),
): RelativeTimeLabel {
  const age = describeAge(date, now);
  const keys = RELATIVE_TIME_KEYS[style];

  switch (age.kind) {
    case "now":
      return { label: t(keys.now), resolution: age.resolution };
    case "minutes":
      return { label: t(keys.minutes, { minutes: age.count }), resolution: age.resolution };
    case "hours":
      return { label: t(keys.hours, { hours: age.count }), resolution: age.resolution };
    case "days":
      return { label: t(keys.days, { days: age.count }), resolution: age.resolution };
    case "date":
      return {
        label: getDateTimeFormatter("monthDay", locale).format(date),
        resolution: age.resolution,
      };
  }
}

/** The prose relative time alone, for a label that is rendered once rather than kept current. */
export function formatTimeAgo(
  date: Date,
  t: TFunction,
  locale: string,
  now: Date = new Date(),
): string {
  return describeRelativeTime(date, "prose", t, locale, now).label;
}

/**
 * How many local midnights lie between two instants: 0 for the same day, 1 for yesterday.
 * Counted on the calendar rather than in elapsed time, so six days and 23 hours ago on
 * today's weekday is 7, and rounded so a DST day of 23 or 25 hours still counts as one.
 */
function localCalendarDaysBetween(earlier: Date, later: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

/**
 * A chat-message timestamp for hover-revealed UI, in the app language (`locale`, a BCP 47 tag).
 * English examples:
 * - Same day: "10:11 PM" or "22:11" depending on user preference
 * - The previous 6 calendar days: "Wednesday 10:11 PM"
 * - Older, including today's weekday last week: "May 14, 2026, 10:11 PM"
 */
export function formatMessageTimestamp(date: Date, locale: string, now: Date = new Date()): string {
  const daysAgo = localCalendarDaysBetween(date, now);

  if (daysAgo === 0) {
    return getDateTimeFormatter("time", locale).format(date);
  }

  // A weekday names one day only while it is under a week back; at seven it would read as today.
  const isWithinWeekdayWindow = daysAgo > 0 && daysAgo < DAYS_PER_WEEK;
  if (isWithinWeekdayWindow) {
    return getDateTimeFormatter("weekdayTime", locale).format(date);
  }

  return getDateTimeFormatter("dateTime", locale).format(date);
}

/**
 * A duration as a compact human-readable string in the app language, in whole units only.
 * English examples: "47s", "2m", "2m 12s", "1h", "1h 5m".
 */
export function formatDuration(durationMs: number, t: TFunction): string {
  const isMeasurable = Number.isFinite(durationMs) && durationMs >= 0;
  if (!isMeasurable) {
    return t("time.duration.seconds", { seconds: 0 });
  }

  const totalSeconds = Math.floor(durationMs / MS_PER_SECOND);
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return t("time.duration.seconds", { seconds: totalSeconds });
  }

  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  if (totalMinutes < MINUTES_PER_HOUR) {
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    if (seconds === 0) {
      return t("time.duration.minutes", { minutes: totalMinutes });
    }
    return t("time.duration.minutesSeconds", { minutes: totalMinutes, seconds });
  }

  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (minutes === 0) {
    return t("time.duration.hours", { hours });
  }
  return t("time.duration.hoursMinutes", { hours, minutes });
}

/**
 * A duration that is often shorter than a second, such as a setup command's, in the app language.
 * Under a second it keeps the milliseconds `formatDuration` would round away.
 * English examples: "350ms", "47s", "2m 12s".
 */
export function formatPreciseDuration(durationMs: number, t: TFunction): string {
  const isSubSecond = Number.isFinite(durationMs) && durationMs >= 0 && durationMs < MS_PER_SECOND;
  if (isSubSecond) {
    return t("time.duration.milliseconds", { milliseconds: Math.round(durationMs) });
  }
  return formatDuration(durationMs, t);
}

/**
 * A duration in its largest whole unit only, for a label with room for one number, such as how
 * long until a usage window resets. Never below minutes. English examples: "0m", "45m", "2h", "3d".
 */
export function formatLargestUnitDuration(durationMs: number, t: TFunction): string {
  const totalMinutes = Math.floor(durationMs / MINUTE_MS);
  const totalHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const totalDays = Math.floor(totalHours / HOURS_PER_DAY);
  if (totalDays > 0) {
    return t("time.duration.days", { days: totalDays });
  }
  if (totalHours > 0) {
    return t("time.duration.hours", { hours: totalHours });
  }
  return t("time.duration.minutes", { minutes: totalMinutes });
}
