import { describe, expect, it } from "vitest";

import { i18n } from "@/i18n/i18next";
import { getTurnDurationLabel } from "./assistant-turn-footer-label";

describe("getTurnDurationLabel", () => {
  it("says how long the turn worked", () => {
    expect(getTurnDurationLabel(14_000, i18n.t)).toBe("Worked for 14s");
  });

  it("words the duration in the active app language", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      expect(getTurnDurationLabel(71_000, i18n.t)).toBe("工作了 1 分 11 秒");
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("reads in the active app language", async () => {
    await i18n.changeLanguage("fr");
    try {
      expect(getTurnDurationLabel(14_000, i18n.t)).toBe("A travaillé pendant 14 s");
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
