import type { TFunction } from "i18next";
import { PRODUCT_NAME } from "@/constants/product";
import { settingsRoute } from "@/desktop/browser/internal-pages";
import { resolveSettingsRoute, type SettingsSection, type SettingsSubpage } from "./routes";

/** A section's name, as its menu item shows it and its page title ends with it. */
export function settingsSectionLabel(section: SettingsSection, t: TFunction): string {
  if (section === "about") {
    return t("workspace.browser.settings.menu.about", { product: PRODUCT_NAME });
  }
  return t(`workspace.browser.settings.menu.${section}`);
}

/** A subpage's name, as its header shows it and its page title ends with it. */
export function settingsSubpageLabel(subpage: SettingsSubpage, t: TFunction): string {
  return t(`workspace.browser.settings.subpages.${subpage}`);
}

/**
 * The settings tab's title, as SettingsRouter.updateTitle_ sets it: 设置 on the settings page
 * itself, 设置 - <section> on a section and on a dialog open over one, 设置 - <subpage> on a
 * subpage.
 */
export function settingsPageTitle(url: string, t: TFunction): string {
  const { section, subpage, isBasicPage } = resolveSettingsRoute(settingsRoute(url));
  if (isBasicPage) {
    return t("workspace.browser.settings.title");
  }
  const page = subpage ? settingsSubpageLabel(subpage, t) : settingsSectionLabel(section, t);
  return t("workspace.browser.settings.pageTitle", { page });
}
