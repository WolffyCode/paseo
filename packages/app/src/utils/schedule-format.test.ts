import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  describeCron,
  everyMsToParts,
  formatCadence,
  formatNextRun,
  isNewAgentSchedule,
  partsToEveryMs,
  resolveScheduleCopyContext,
  resolveScheduleTitle,
  validateCron,
} from "./schedule-format";

// The real instance, so a helper that names a key nobody added renders as that key and fails.
beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.init();
  }
  await i18n.changeLanguage("en");
});

const t = i18n.t;

function createSchedule(input: {
  name?: string | null;
  prompt?: string;
  title?: string | null;
  targetType?: "agent" | "new-agent";
}): ScheduleSummary {
  return {
    id: "schedule-1",
    name: input.name ?? null,
    prompt: input.prompt ?? "Run the task",
    cadence: { type: "every", everyMs: 60_000 },
    target:
      input.targetType === "agent"
        ? { type: "agent", agentId: "00000000-0000-4000-8000-000000000000" }
        : {
            type: "new-agent",
            config: {
              provider: "codex",
              cwd: "/tmp/project",
              title: input.title,
            },
          },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextRunAt: null,
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("schedule title helpers", () => {
  it("identifies new-agent schedules", () => {
    expect(isNewAgentSchedule(createSchedule({ targetType: "new-agent" }))).toBe(true);
    expect(isNewAgentSchedule(createSchedule({ targetType: "agent" }))).toBe(false);
  });

  it("selects heartbeat wording for agent-target records", () => {
    expect(resolveScheduleCopyContext(createSchedule({ targetType: "new-agent" }))).toBeUndefined();
    expect(resolveScheduleCopyContext(createSchedule({ targetType: "agent" }))).toBe("heartbeat");
  });

  it("resolves display titles by name, config title, prompt, then fallback", () => {
    expect(
      resolveScheduleTitle(t, createSchedule({ name: "Morning run", title: "Config title" })),
    ).toBe("Morning run");
    expect(resolveScheduleTitle(t, createSchedule({ name: " ", title: "Config title" }))).toBe(
      "Config title",
    );
    expect(
      resolveScheduleTitle(t, createSchedule({ name: " ", title: " ", prompt: "\nPrompt line" })),
    ).toBe("Prompt line");
    expect(resolveScheduleTitle(t, createSchedule({ name: " ", title: " ", prompt: "\n  " }))).toBe(
      "Untitled schedule",
    );
    expect(resolveScheduleTitle(t, createSchedule({ targetType: "agent", prompt: " " }))).toBe(
      "Untitled heartbeat",
    );
  });
});

describe("interval formatting", () => {
  it("round-trips interval parts and formats cadence labels", () => {
    expect(everyMsToParts(2 * 24 * 60 * 60_000)).toEqual({ value: 2, unit: "days" });
    expect(everyMsToParts(3 * 60 * 60_000)).toEqual({ value: 3, unit: "hours" });
    expect(everyMsToParts(90_000)).toEqual({ value: 2, unit: "minutes" });
    expect(everyMsToParts(0)).toEqual({ value: 1, unit: "hours" });

    expect(partsToEveryMs(2, "hours")).toBe(2 * 60 * 60_000);
    expect(partsToEveryMs(0, "minutes")).toBe(60_000);
    expect(formatCadence(t, { type: "every", everyMs: 2 * 60 * 60_000 })).toBe("Every 2 hours");
    expect(formatCadence(t, { type: "every", everyMs: 60_000 })).toBe("Every minute");
  });
});

describe("describeCron", () => {
  it("humanizes common fixed-time cron shapes", () => {
    expect(describeCron(t, { type: "cron", expression: "* * * * *" })).toBe("Every minute");
    expect(describeCron(t, { type: "cron", expression: "0 * * * *" })).toBe("Every hour");
    expect(describeCron(t, { type: "cron", expression: "15 * * * *" })).toBe("Every hour at :15");
    expect(describeCron(t, { type: "cron", expression: "0 9 * * *" })).toBe("Daily at 09:00 UTC");
    expect(describeCron(t, { type: "cron", expression: "0 9 * * 1-5" })).toBe(
      "Weekdays at 09:00 UTC",
    );
    expect(describeCron(t, { type: "cron", expression: "0 9 * * 0,6" })).toBe(
      "Weekends at 09:00 UTC",
    );
    expect(describeCron(t, { type: "cron", expression: "0 9 * * 1" })).toBe("Mondays at 09:00 UTC");
  });

  it("labels fixed-time cron cadences with their stored timezone", () => {
    expect(
      describeCron(t, {
        type: "cron",
        expression: "0 9 * * *",
        timezone: "America/New_York",
      }),
    ).toBe("Daily at 09:00 America/New_York");
    expect(
      formatCadence(t, {
        type: "cron",
        expression: "0 9 * * 1-5",
        timezone: "Europe/Madrid",
      }),
    ).toBe("Weekdays at 09:00 Europe/Madrid");
  });

  it("keeps timezone-less fixed-time cron cadences labeled as UTC", () => {
    expect(formatCadence(t, { type: "cron", expression: "0 9 * * *" })).toBe("Daily at 09:00 UTC");
  });

  it("returns null for invalid or unrecognized valid cron expressions", () => {
    expect(describeCron(t, { type: "cron", expression: "not a cron" })).toBeNull();
    expect(describeCron(t, { type: "cron", expression: "*/5 * * * *" })).toBeNull();
    expect(formatCadence(t, { type: "cron", expression: "*/5 * * * *" })).toBe("*/5 * * * *");
  });
});

describe("validateCron", () => {
  it("accepts structurally valid cron expressions", () => {
    expect(validateCron(t, "*/5 9-17 * 1,6 1-5")).toBeNull();
  });

  it("rejects step fields with extra slash tokens", () => {
    expect(validateCron(t, "*/5/2 * * * *")).toBe("Invalid minute step");
  });

  it("rejects malformed fields with targeted messages", () => {
    expect(validateCron(t, "")).toBe("Enter a cron expression");
    expect(validateCron(t, "* * *")).toBe("Cron expressions must have 5 fields");
    expect(validateCron(t, "60 * * * *")).toBe("Invalid minute value");
    expect(validateCron(t, "* 24 * * *")).toBe("Invalid hour value");
    expect(validateCron(t, "* * 31-1 * *")).toBe("Invalid day-of-month range");
    expect(validateCron(t, "* * * */0 *")).toBe("Invalid month step");
    expect(validateCron(t, "* * * * mon")).toBe("Invalid day-of-week value");
    expect(validateCron(t, "1,,2 * * * *")).toBe("Invalid minute field");
  });
});

describe("formatNextRun", () => {
  it("formats next-run distance from the current clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    expect(formatNextRun(t, null)).toBe("");
    expect(formatNextRun(t, "not-a-date")).toBe("");
    expect(formatNextRun(t, "2025-12-31T23:00:00.000Z")).toBe("Next run soon");
    expect(formatNextRun(t, "2026-01-01T00:00:15.000Z")).toBe("Next run soon");
    expect(formatNextRun(t, "2026-01-01T00:30:00.000Z")).toBe("Next run in 30m");
    expect(formatNextRun(t, "2026-01-01T03:00:00.000Z")).toBe("Next run in 3h");
    expect(formatNextRun(t, "2026-01-03T00:00:00.000Z")).toBe("Next run in 2d");
  });
});

describe("localized schedule copy", () => {
  it("translates cadence, recurring days, and protocol cron errors", () => {
    const zhT = i18n.getFixedT("zh-CN");
    expect(describeCron(zhT, { type: "cron", expression: "0 9 * * 1" })).toBe(
      "每周一 09:00（UTC）",
    );
    expect(validateCron(zhT, "*/5/2 * * * *")).toBe("分钟步长无效");
    expect(validateCron(zhT, "* * *")).toBe("cron 表达式必须包含 5 个字段");
  });

  it("keeps Russian and Arabic interval counts out of the English fallback", () => {
    const ruT = i18n.getFixedT("ru");
    const arT = i18n.getFixedT("ar");
    expect(formatCadence(ruT, { type: "every", everyMs: 3 * 60_000 })).toBe("Каждые 3 мин");
    expect(formatCadence(arT, { type: "every", everyMs: 3 * 60 * 60_000 })).toBe("كل 3 ساعة");
  });
});
