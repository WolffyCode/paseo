import type { TFunction } from "i18next";
import type { ScheduleCadence, ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { validateCronExpression } from "@getpaseo/protocol/schedule/cron-expression";

export type IntervalUnit = "minutes" | "hours" | "days";
type CronCadence = Extract<ScheduleCadence, { type: "cron" }>;

/**
 * i18next context selecting the heartbeat wording for any key that carries a `_heartbeat`
 * variant: `t(key, { context })` resolves `key_heartbeat` for agent-target records and falls back
 * to the base (schedule) string otherwise.
 */
export type ScheduleCopyContext = "heartbeat" | undefined;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

const UNIT_MS: Record<IntervalUnit, number> = {
  minutes: MS_PER_MINUTE,
  hours: MS_PER_HOUR,
  days: MS_PER_DAY,
};

const EVERY_SINGLE_UNIT_KEYS: Record<IntervalUnit, string> = {
  minutes: "schedules.cadence.everyMinute",
  hours: "schedules.cadence.everyHour",
  days: "schedules.cadence.everyDay",
};

// Separate keys instead of `_one`/`_other` plurals: with only those two suffixes, i18next falls
// back to English for the Russian and Arabic counts that resolve to `_few`/`_many`.
const EVERY_MULTIPLE_UNITS_KEYS: Record<IntervalUnit, string> = {
  minutes: "schedules.cadence.everyMinutes",
  hours: "schedules.cadence.everyHours",
  days: "schedules.cadence.everyDays",
};

// Recurring-day phrases ("Mondays", "по понедельникам") are grammatical forms Intl weekday names
// cannot produce. Indexed by cron day-of-week, 0 = Sunday.
const RECURRING_DAY_KEYS = [
  "schedules.cadence.recurringDays.sunday",
  "schedules.cadence.recurringDays.monday",
  "schedules.cadence.recurringDays.tuesday",
  "schedules.cadence.recurringDays.wednesday",
  "schedules.cadence.recurringDays.thursday",
  "schedules.cadence.recurringDays.friday",
  "schedules.cadence.recurringDays.saturday",
] as const;

// The protocol validator reports in English from a closed set of messages: the field-count rule
// and `Invalid cron <field> <problem>`. They are mapped onto localized keys here; a message the
// protocol adds later reads as the generic invalid-expression error.
const PROTOCOL_FIELD_COUNT_ERROR = "Cron expressions must have 5 fields";
const PROTOCOL_FIELD_ERROR_PATTERN = /^Invalid cron ([a-z-]+) ([a-z]+)$/;

const CRON_FIELD_NAME_KEYS = new Map<string, string>([
  ["minute", "schedules.cron.fields.minute"],
  ["hour", "schedules.cron.fields.hour"],
  ["day-of-month", "schedules.cron.fields.dayOfMonth"],
  ["month", "schedules.cron.fields.month"],
  ["day-of-week", "schedules.cron.fields.dayOfWeek"],
]);

const CRON_PROBLEM_KEYS = new Map<string, string>([
  ["step", "schedules.cron.invalidStep"],
  ["field", "schedules.cron.invalidField"],
  ["range", "schedules.cron.invalidRange"],
  ["value", "schedules.cron.invalidValue"],
]);

export function isNewAgentSchedule(schedule: ScheduleSummary): boolean {
  return schedule.target.type === "new-agent";
}

export function resolveScheduleCopyContext(schedule: ScheduleSummary): ScheduleCopyContext {
  if (schedule.target.type === "agent") {
    return "heartbeat";
  }
  return undefined;
}

export function resolveScheduleTitle(t: TFunction, schedule: ScheduleSummary): string {
  const name = schedule.name?.trim();
  if (name) {
    return name;
  }
  if (schedule.target.type === "new-agent") {
    const configTitle = schedule.target.config.title?.trim();
    if (configTitle) {
      return configTitle;
    }
  }
  const firstPromptLine = schedule.prompt
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstPromptLine) {
    return firstPromptLine;
  }
  return t("schedules.untitled", { context: resolveScheduleCopyContext(schedule) });
}

export function everyMsToParts(ms: number): { value: number; unit: IntervalUnit } {
  if (!Number.isFinite(ms) || ms <= 0) {
    return { value: 1, unit: "hours" };
  }
  if (ms % MS_PER_DAY === 0) {
    return { value: ms / MS_PER_DAY, unit: "days" };
  }
  if (ms % MS_PER_HOUR === 0) {
    return { value: ms / MS_PER_HOUR, unit: "hours" };
  }
  return { value: Math.max(1, Math.round(ms / MS_PER_MINUTE)), unit: "minutes" };
}

export function partsToEveryMs(value: number, unit: IntervalUnit): number {
  const normalized = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
  return normalized * UNIT_MS[unit];
}

function formatEvery(t: TFunction, everyMs: number): string {
  const { value, unit } = everyMsToParts(everyMs);
  if (value === 1) {
    return t(EVERY_SINGLE_UNIT_KEYS[unit]);
  }
  return t(EVERY_MULTIPLE_UNITS_KEYS[unit], { count: value });
}

export function formatCadence(t: TFunction, cadence: ScheduleCadence): string {
  if (cadence.type === "every") {
    return formatEvery(t, cadence.everyMs);
  }
  return describeCron(t, cadence) ?? cadence.expression;
}

/**
 * Humanize a handful of common 5-field cron shapes. Returns null when the
 * expression is valid but not one of the recognized patterns (callers fall
 * back to showing the raw expression).
 */
export function describeCron(t: TFunction, cadence: CronCadence): string | null {
  const trimmed = cadence.expression.trim();
  if (validateCronExpression(trimmed) !== null) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = trimmed.split(/\s+/);

  // Only humanize the simple "fixed time" family: literal minute/hour with the
  // date fields either wildcarded or a recognized day-of-week constraint.
  const minuteNum = Number.parseInt(minute, 10);
  const isLiteralMinute = /^\d+$/.test(minute);
  const isWildcardMonth = month === "*";
  const isWildcardDom = dayOfMonth === "*";

  if (minute === "*" && hour === "*" && isWildcardMonth && isWildcardDom && dayOfWeek === "*") {
    return t("schedules.cadence.everyMinute");
  }

  if (!isLiteralMinute || !isWildcardMonth || !isWildcardDom) {
    return null;
  }

  // "Every hour" / "Every hour at :MM"
  if (hour === "*") {
    if (dayOfWeek !== "*") {
      return null;
    }
    if (minuteNum === 0) {
      return t("schedules.cadence.everyHour");
    }
    return t("schedules.cadence.everyHourAt", { minute: pad2(minuteNum) });
  }

  if (!/^\d+$/.test(hour)) {
    return null;
  }
  const time = `${pad2(Number.parseInt(hour, 10))}:${pad2(minuteNum)}`;
  const timezone = cadence.timezone ?? "UTC";
  return describeCronDayAt(t, dayOfWeek, { time, timezone });
}

function describeCronDayAt(
  t: TFunction,
  dayOfWeek: string,
  at: { time: string; timezone: string },
): string | null {
  if (dayOfWeek === "*") {
    return t("schedules.cadence.dailyAt", at);
  }
  if (dayOfWeek === "1-5") {
    return t("schedules.cadence.weekdaysAt", at);
  }
  if (dayOfWeek === "0,6" || dayOfWeek === "6,0") {
    return t("schedules.cadence.weekendsAt", at);
  }
  if (!/^\d$/.test(dayOfWeek)) {
    return null;
  }
  const dayKey = RECURRING_DAY_KEYS[Number.parseInt(dayOfWeek, 10)];
  if (!dayKey) {
    return null;
  }
  return t("schedules.cadence.weeklyAt", { ...at, day: t(dayKey) });
}

export function validateCron(t: TFunction, expr: string): string | null {
  const trimmed = expr.trim();
  if (!trimmed) {
    return t("schedules.cron.empty");
  }

  const protocolError = validateCronExpression(trimmed);
  if (protocolError === null) {
    return null;
  }
  return localizeProtocolCronError(t, protocolError);
}

function localizeProtocolCronError(t: TFunction, protocolError: string): string {
  if (protocolError === PROTOCOL_FIELD_COUNT_ERROR) {
    return t("schedules.cron.fieldCount");
  }
  const fieldError = PROTOCOL_FIELD_ERROR_PATTERN.exec(protocolError);
  if (!fieldError) {
    return t("schedules.cron.invalid");
  }
  const fieldNameKey = CRON_FIELD_NAME_KEYS.get(fieldError[1]);
  const problemKey = CRON_PROBLEM_KEYS.get(fieldError[2]);
  if (!fieldNameKey || !problemKey) {
    return t("schedules.cron.invalid");
  }
  return t(problemKey, { field: t(fieldNameKey) });
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The next-run phrase for a schedule row, e.g. "Next run in 3h" or "Next run soon".
 * Returns "" when there is no scheduled next run.
 */
export function formatNextRun(t: TFunction, iso: string | null): string {
  if (!iso) {
    return "";
  }
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return "";
  }

  const diffMs = target - Date.now();
  if (diffMs < MS_PER_MINUTE) {
    return t("schedules.nextRun.soon");
  }
  if (diffMs < MS_PER_HOUR) {
    return t("schedules.nextRun.inMinutes", { count: Math.round(diffMs / MS_PER_MINUTE) });
  }
  if (diffMs < MS_PER_DAY) {
    return t("schedules.nextRun.inHours", { count: Math.round(diffMs / MS_PER_HOUR) });
  }
  return t("schedules.nextRun.inDays", { count: Math.round(diffMs / MS_PER_DAY) });
}
