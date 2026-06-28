import { autorun } from "mobx";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";
import { I18nModel, SHELL_MESSAGES } from "./i18n-model";

// The shell's i18n model (class + MobX). It owns the active `locale` and resolves shell
// copy through `t(key)`, reusing the app's locale system (SupportedLocale / DEFAULT_LOCALE)
// and the namespace=module key protocol ("shell.*"). Components read it through `observer`.
describe("I18nModel", () => {
  // A fresh model lands on the app default locale and resolves a known shell key to its
  // English value — the shell always renders defined copy from the first frame.
  it("defaults to the app default locale and resolves a known key", () => {
    const model = new I18nModel();
    expect(model.locale).toBe(DEFAULT_LOCALE);
    expect(model.t("shell.back")).toBe("Back");
    expect(model.t("shell.settings")).toBe("Settings");
  });

  // setLocale is the single write path; switching to Simplified Chinese resolves the same
  // keys to their localized values.
  it("setLocale switches the resolved language", () => {
    const model = new I18nModel();
    model.setLocale("zh-CN");
    expect(model.locale).toBe("zh-CN");
    expect(model.t("shell.back")).toBe("返回");
    expect(model.t("shell.settings")).toBe("设置");
  });

  // A locale with no shipped table (the shell ships en + zh-CN; others fall back) resolves
  // through the English base rather than showing a raw key.
  it("falls back to English for a locale without a shipped table", () => {
    const model = new I18nModel();
    model.setLocale("fr");
    expect(model.t("shell.back")).toBe("Back");
  });

  // A genuinely unknown key returns the key itself — a visible, greppable miss instead of
  // a crash or an empty string.
  it("returns the key itself when nothing matches", () => {
    const model = new I18nModel();
    expect(model.t("shell.does.not.exist")).toBe("shell.does.not.exist");
  });

  // locale is observable and t() reads it, so an autorun over t() re-runs on setLocale —
  // this is what repaints `observer` components on a language switch.
  it("notifies observers reading t() when the locale changes", () => {
    const model = new I18nModel();
    const seen: string[] = [];
    const dispose = autorun(() => seen.push(model.t("shell.back")));
    model.setLocale("zh-CN");
    model.setLocale("en");
    dispose();
    expect(seen).toEqual(["Back", "返回", "Back"]);
  });
});

describe("SHELL_MESSAGES", () => {
  // en is the mandatory base every other locale falls back to, and zh-CN is fully shipped;
  // zh-CN must cover every en key so the Chinese UI never silently degrades to English.
  it("ships en as the base and zh-CN at full parity with it", () => {
    const enKeys = Object.keys(SHELL_MESSAGES.en).sort();
    const zhKeys = Object.keys(SHELL_MESSAGES["zh-CN"] ?? {}).sort();
    expect(enKeys.length).toBeGreaterThan(0);
    expect(zhKeys).toEqual(enKeys);
  });

  // Every shipped key sits under the shell namespace (first segment = module name), the
  // i18n key protocol the standard pins.
  it("namespaces every key under shell.*", () => {
    const offenders = (Object.keys(SHELL_MESSAGES.en) as string[]).filter(
      (k) => !k.startsWith("shell."),
    );
    expect(offenders).toEqual([]);
  });

  // The locale union the model accepts is the app's SupportedLocale — reuse, not a parallel
  // locale set.
  it("keys its tables by the app SupportedLocale", () => {
    const locale: SupportedLocale = "zh-CN";
    expect(SHELL_MESSAGES[locale]).toBeDefined();
  });
});
