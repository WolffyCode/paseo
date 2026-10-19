import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  CADENCE_PRESET_OPTIONS,
  normalizeScheduleFormCadence,
  resolveCronPresetDisplay,
  resolveCronPresetId,
} from "./schedule-cadence-options";

describe("schedule cadence form options", () => {
  // The real instance, so a preset that names a key nobody added renders as that key and fails.
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init();
    }
    await i18n.changeLanguage("en");
  });

  it("offers the approved cron preset vocabulary", () => {
    expect(CADENCE_PRESET_OPTIONS.map((option) => i18n.t(option.labelKey))).toEqual([
      "Every minute",
      "Every hour",
      "Daily 9:00",
      "Weekdays 9:00",
      "Mondays 9:00",
    ]);
  });

  it("names a preset cadence by its preset and anything else as custom cron", () => {
    expect(
      resolveCronPresetDisplay(i18n.t, { type: "cron", expression: "0 9 * * 1-5" }).label,
    ).toBe("Weekdays 9:00");
    expect(
      resolveCronPresetDisplay(i18n.t, { type: "cron", expression: "*/5 * * * *" }).label,
    ).toBe("Custom cron");
  });

  it("maps interval cadences to cron cadences for the form", () => {
    expect(
      normalizeScheduleFormCadence({ type: "every", everyMs: 60_000 }, "Europe/Madrid"),
    ).toEqual({
      type: "cron",
      expression: "* * * * *",
      timezone: "Europe/Madrid",
    });
    expect(
      normalizeScheduleFormCadence({ type: "every", everyMs: 60 * 60_000 }, "Europe/Madrid"),
    ).toEqual({
      type: "cron",
      expression: "0 * * * *",
      timezone: "Europe/Madrid",
    });
    expect(
      normalizeScheduleFormCadence({ type: "every", everyMs: 24 * 60 * 60_000 }, "Europe/Madrid"),
    ).toEqual({
      type: "cron",
      expression: "0 9 * * *",
      timezone: "Europe/Madrid",
    });
  });

  it("maps unsupported intervals to the closest custom cron expression", () => {
    const cadence = normalizeScheduleFormCadence(
      { type: "every", everyMs: 5 * 60_000 },
      "Europe/Madrid",
    );

    expect(cadence).toEqual({
      type: "cron",
      expression: "*/5 * * * *",
      timezone: "Europe/Madrid",
    });
    expect(resolveCronPresetId(cadence)).toBe("custom");
  });
});
