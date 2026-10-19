import { useBrowserExtensionsStore } from "@/desktop/browser/extensions/store";
import { DEFAULT_SEARCH_ENGINE_ID, useSearchEngineStore } from "@/desktop/browser/search-engines";
import { useBrowserToolbarSettingsStore } from "@/desktop/browser/toolbar/settings";
import { getDesktopHost } from "@/desktop/host";

/**
 * Chrome's ProfileResetter as far as this browser has those settings: the search engine, the home
 * button and home page back to a fresh profile's, every extension turned off, and cookies and
 * site data deleted. Bookmarks, history and passwords stay, as the dialog says.
 */
export async function resetBrowserSettings(): Promise<void> {
  useSearchEngineStore.getState().setDefaultEngine(DEFAULT_SEARCH_ENGINE_ID);
  const toolbar = useBrowserToolbarSettingsStore.getState();
  toolbar.setShowHomeButton(false);
  toolbar.setHomePage({ isNewTabPage: true, url: "" });

  const browser = getDesktopHost()?.browser;
  const enabledExtensions = useBrowserExtensionsStore
    .getState()
    .extensions.filter((extension) => extension.isEnabled);
  await Promise.all([
    ...enabledExtensions.map((extension) => browser?.extensions?.setEnabled(extension.id, false)),
    browser?.browsingData?.clear({ siteData: true, cache: false, origins: null }),
  ]);
}
