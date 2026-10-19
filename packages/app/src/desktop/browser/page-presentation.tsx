import { useCallback, useMemo, useState } from "react";
import { Image } from "react-native";
import { Globe } from "lucide-react-native";
import type { TFunction } from "i18next";
import { ChromeIcon } from "@/desktop/browser/chrome-icons";
import { settingsPageTitle } from "@/desktop/browser/chrome-settings/titles";
import { browserInternalPage } from "@/desktop/browser/internal-pages";
import { isBrowserStartUrl } from "@/desktop/browser/start-page";
import type { BrowserRecord } from "@/desktop/browser/store";
import type { PanelIconProps } from "@/panels/panel-registry";

/**
 * What a tab calls a page: Helm's own pages by name, else the page title, else its host, else the
 * address as typed.
 */
export function browserPageLabel(
  browser: Pick<BrowserRecord, "title" | "url"> | null,
  t: TFunction,
): string {
  const url = browser?.url ?? "";
  if (isBrowserStartUrl(url)) {
    return t("workspace.browser.tabs.newTab");
  }
  const internalPage = browserInternalPage(url);
  if (internalPage === "extensions") {
    return t("workspace.browser.extensions.page.title");
  }
  if (internalPage === "downloads") {
    return t("workspace.browser.downloads.page.title");
  }
  if (internalPage === "settings") {
    return settingsPageTitle(url, t);
  }
  const title = browser?.title.trim() ?? "";
  if (title) {
    return title;
  }
  try {
    return new URL(url).hostname || url;
  } catch {
    // An address that does not parse is shown as typed.
    return url;
  }
}

/** A page's favicon; Helm's own pages show their Chrome icon, as chrome:// pages do. */
export function BrowserPageIcon({
  faviconUrl,
  pageUrl,
  size,
  color,
}: PanelIconProps & { faviconUrl: string | null; pageUrl?: string }) {
  const [brokenFaviconUrl, setBrokenFaviconUrl] = useState<string | null>(null);
  const source = useMemo(() => (faviconUrl ? { uri: faviconUrl } : undefined), [faviconUrl]);
  const imageStyle = useMemo(() => ({ width: size, height: size, borderRadius: 3 }), [size]);
  const handleError = useCallback(() => setBrokenFaviconUrl(faviconUrl), [faviconUrl]);

  const internalPage = pageUrl ? browserInternalPage(pageUrl) : null;
  if (internalPage === "extensions") {
    return <ChromeIcon name="extensions" size={size} color={color} />;
  }
  if (internalPage === "downloads") {
    return <ChromeIcon name="download" size={size} color={color} />;
  }
  if (internalPage === "settings") {
    return <ChromeIcon name="settings" size={size} color={color} />;
  }
  // A page can declare an empty icon (`data:,`) or one that fails to load; both show the globe.
  if (faviconUrl && faviconUrl !== brokenFaviconUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={source}
        style={imageStyle}
        onError={handleError}
      />
    );
  }

  return <Globe size={size} color={color} />;
}
