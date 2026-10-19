import { useEffect } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getIsElectron } from "@/constants/platform";
import { getDesktopHost, type DesktopBrowserPageMenuLabels } from "@/desktop/host";
import { SEARCH_ENGINE_NAME } from "./address-input";

// The main process puts the selected text here when it shows "Search Google for …".
const SEARCH_TERMS_SLOT = "{{terms}}";

function pageMenuLabels(t: TFunction): DesktopBrowserPageMenuLabels {
  return {
    back: t("workspace.browser.pageMenu.back"),
    forward: t("workspace.browser.pageMenu.forward"),
    reload: t("workspace.browser.pageMenu.reload"),
    savePageAs: t("workspace.browser.pageMenu.savePageAs"),
    print: t("workspace.browser.pageMenu.print"),
    viewPageSource: t("workspace.browser.pageMenu.viewPageSource"),
    inspect: t("workspace.browser.pageMenu.inspect"),
    openLinkInNewTab: t("workspace.browser.pageMenu.openLinkInNewTab"),
    saveLinkAs: t("workspace.browser.pageMenu.saveLinkAs"),
    copyLinkAddress: t("workspace.browser.pageMenu.copyLinkAddress"),
    copyEmailAddress: t("workspace.browser.pageMenu.copyEmailAddress"),
    openImageInNewTab: t("workspace.browser.pageMenu.openImageInNewTab"),
    saveImageAs: t("workspace.browser.pageMenu.saveImageAs"),
    copyImage: t("workspace.browser.pageMenu.copyImage"),
    copyImageAddress: t("workspace.browser.pageMenu.copyImageAddress"),
    copy: t("workspace.browser.pageMenu.copy"),
    searchWebFor: t("workspace.browser.pageMenu.searchWebFor", {
      engine: SEARCH_ENGINE_NAME,
      terms: SEARCH_TERMS_SLOT,
      interpolation: { escapeValue: false },
    }),
    undo: t("workspace.browser.pageMenu.undo"),
    redo: t("workspace.browser.pageMenu.redo"),
    cut: t("workspace.browser.pageMenu.cut"),
    paste: t("workspace.browser.pageMenu.paste"),
    pasteAndMatchStyle: t("workspace.browser.pageMenu.pasteAndMatchStyle"),
    selectAll: t("workspace.browser.pageMenu.selectAll"),
    addToDictionary: t("workspace.browser.pageMenu.addToDictionary"),
  };
}

/**
 * Hands the main process Chrome's page menu labels in the app's language, again whenever the
 * language changes. The main process shows that menu but has no translations of its own.
 */
export function useBrowserPageMenuLabels(): void {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const setPageMenuLabels = getDesktopHost()?.browser?.setPageMenuLabels;
    if (!getIsElectron() || !setPageMenuLabels) {
      return;
    }
    void setPageMenuLabels(pageMenuLabels(t)).catch((error: unknown) => {
      console.error("[browser-page-menu] sending labels failed", error);
    });
  }, [t, i18n.language]);
}
