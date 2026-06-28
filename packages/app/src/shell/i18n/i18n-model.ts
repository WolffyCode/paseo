import { makeAutoObservable } from "mobx";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n/locales";
import { SHELL_MESSAGES } from "./messages";

// The shell's i18n model (class + MobX). It owns the active `locale` and resolves shell
// copy through `t(key)`, reusing the app's locale system (SupportedLocale / DEFAULT_LOCALE /
// resolveSupportedLocale) and the namespace=module key protocol ("shell.*"). Components read
// it through `observer`; the shell-root bridge feeds it the resolved locale via setLocale.

export { SHELL_MESSAGES } from "./messages";

export class I18nModel {
  // The active locale. Public-observable, written only through setLocale (the shell-root
  // bridge feeds it resolveSupportedLocale(settings.language, systemLocales)).
  locale: SupportedLocale = DEFAULT_LOCALE;

  constructor() {
    // autoBind so t / setLocale keep their `this` when destructured or handed to the bridge.
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Resolve a "shell.*" key to copy for the active locale, falling back to English, then to
  // the key itself (a visible, greppable miss). Reads `this.locale` first so observers that
  // call t() repaint on a language switch.
  t(key: string): string {
    const table = SHELL_MESSAGES[this.locale];
    return table?.[key] ?? SHELL_MESSAGES.en[key] ?? key;
  }

  // The single write path for the locale. Idempotent on equal values (MobX skips equal
  // assignments), so a steady system locale never churns observers.
  setLocale(locale: SupportedLocale): void {
    this.locale = locale;
  }
}

// App-wide singleton — the shell's one i18n model.
export const i18nModel = new I18nModel();
