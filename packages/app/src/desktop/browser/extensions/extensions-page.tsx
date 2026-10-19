import { useCallback, useEffect, useState } from "react";
import { ScrollView, View, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import {
  BROWSER_EXTENSIONS_URL,
  extensionDetailsId,
  extensionDetailsUrl,
} from "@/desktop/browser/internal-pages";
import { CrToolbar } from "@/desktop/browser/webui/toolbar";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { openBrowserFromPage } from "@/desktop/browser/workspace-browsers";
import { getDesktopHost, type DesktopBrowserExtension } from "@/desktop/host";
import { ExtensionDetails } from "./extension-details";
import { ExtensionsList } from "./extensions-list";
import { ExtensionsDrawer, ExtensionsSidebar } from "./extensions-sidebar";
import { useBrowserExtensionsStore } from "./store";
import { ExtensionUninstallDialog } from "./toolbar";
import { CHROME_WEB_STORE_HOME_URL } from "./web-store";

function setExtensionEnabled(extensionId: string, isEnabled: boolean): void {
  void getDesktopHost()
    ?.browser?.extensions?.setEnabled(extensionId, isEnabled)
    .catch((error: unknown) => {
      console.error("[browser-extensions] turning an extension on or off failed", error);
    });
}

/**
 * Chrome's chrome://extensions as one of the browser's own pages (paseo://extensions): the
 * installed extensions as cards, and one extension's details for `?id=`.
 */
export function BrowserExtensionsPage({
  browserId,
  url,
  onNavigate,
}: {
  browserId: string;
  url: string;
  onNavigate: (url: string) => void;
}) {
  const { t } = useTranslation();
  const extensions = useBrowserExtensionsStore((state) => state.extensions);
  const [pageWidth, setPageWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [extensionPendingRemoval, setExtensionPendingRemoval] =
    useState<DesktopBrowserExtension | null>(null);
  const detailsId = extensionDetailsId(url);
  const shownExtension = detailsId
    ? (extensions.find((extension) => extension.id === detailsId) ?? null)
    : null;
  const isNarrow = pageWidth <= WEBUI_LAYOUT.narrowWidth;

  // An extension removed while its details are open takes the page back to the list, as in
  // Chrome.
  const isShowingRemovedExtension = detailsId !== null && shownExtension === null;
  useEffect(() => {
    if (isShowingRemovedExtension) onNavigate(BROWSER_EXTENSIONS_URL);
  }, [isShowingRemovedExtension, onNavigate]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);
  const openInNewTab = useCallback(
    (targetUrl: string) => {
      openBrowserFromPage({ sourceBrowserId: browserId, url: targetUrl, isActive: true });
    },
    [browserId],
  );
  const openWebStore = useCallback(() => openInNewTab(CHROME_WEB_STORE_HOME_URL), [openInNewTab]);
  const showDetails = useCallback(
    (extensionId: string) => {
      onNavigate(extensionDetailsUrl(extensionId));
    },
    [onNavigate],
  );
  const showList = useCallback(() => onNavigate(BROWSER_EXTENSIONS_URL), [onNavigate]);
  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const closeRemoval = useCallback(() => setExtensionPendingRemoval(null), []);

  const viewWidth = isNarrow ? pageWidth : pageWidth - WEBUI_LAYOUT.sidebarWidth;
  let view = (
    <ExtensionsList
      extensions={extensions}
      query={query}
      listWidth={viewWidth}
      onShowDetails={showDetails}
      onRemove={setExtensionPendingRemoval}
      onSetEnabled={setExtensionEnabled}
      onOpenWebStore={openWebStore}
    />
  );
  if (shownExtension) {
    view = (
      <ExtensionDetails
        extension={shownExtension}
        onBack={showList}
        onOpenInNewTab={openInNewTab}
        onRemove={setExtensionPendingRemoval}
        onSetEnabled={setExtensionEnabled}
      />
    );
  }

  return (
    <View style={styles.page} onLayout={handleLayout} testID="browser-extensions-page">
      <CrToolbar
        title={t("workspace.browser.extensions.page.title")}
        searchLabel={t("workspace.browser.extensions.page.search")}
        onMenuPress={openDrawer}
        isNarrow={isNarrow}
        onSearchChange={setQuery}
      />
      <ScrollView style={styles.scroller} contentContainerStyle={styles.scrollContent}>
        {isNarrow ? null : (
          <View style={styles.sidebarColumn}>
            <ExtensionsSidebar onOpenWebStore={openWebStore} />
          </View>
        )}
        <View style={[styles.view, shownExtension ? styles.detailsView : null]}>{view}</View>
        {isNarrow ? null : <View style={styles.balanceColumn} />}
      </ScrollView>
      {isNarrow && isDrawerOpen ? (
        <ExtensionsDrawer onClose={closeDrawer} onOpenWebStore={openWebStore} />
      ) : null}
      {extensionPendingRemoval ? (
        <ExtensionUninstallDialog extension={extensionPendingRemoval} onClose={closeRemoval} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    page: {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.page,
    },
    scroller: {
      flex: 1,
      minHeight: 0,
    },
    scrollContent: {
      flexGrow: 1,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    // Chrome's #left, #viewManager and #right: three growing columns, the sidebar at least 256.
    sidebarColumn: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: WEBUI_LAYOUT.sidebarWidth,
    },
    view: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 950,
      minWidth: 0,
    },
    detailsView: {
      flexBasis: 680,
    },
    balanceColumn: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    },
  };
});
