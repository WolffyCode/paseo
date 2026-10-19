import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { getDesktopHost, type DesktopBrowserDownload } from "@/desktop/host";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { CHROME_FONT_FAMILY } from "../chrome-theme";
import { CrButton } from "../webui/controls";
import { NoDownloadsIllustration } from "../webui/icons";
import { CrToolbar } from "../webui/toolbar";
import { WEBUI_LAYOUT } from "../webui/theme";
import { DownloadCard } from "./download-card.electron";
import { pageDateHeader } from "./format";
import {
  cardMenuActions,
  hasClearableDownloads,
  matchesSearch,
  startsNewDay,
  type DownloadCardButton,
  type DownloadMenuAction,
} from "./page-model";
import { useBrowserDownloadsStore } from "./store";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

// cr-toolbar folds its search field below 900 dip on this page (cr_toolbar.ts narrowThreshold).
const NARROW_WIDTH = 900;
// manager.css: cards are clamp(550px, 80%, 680px) wide.
const CARD_MIN_WIDTH = 550;
const CARD_MAX_WIDTH = 680;
const CARD_WIDTH_SHARE = 0.8;
const CARD_SIDE_MARGIN = 48;
const EMPTY_ILLUSTRATION_HEIGHT = 144;
const MENU_ITEM_HEIGHT = 36;
const TOAST_HEIGHT = 52;
const TOAST_MIN_WIDTH = 288;
const TOAST_EDGE = 24;

const MENU_LABEL_KEYS = {
  pause: "workspace.browser.downloads.page.pause",
  resume: "workspace.browser.downloads.page.resume",
  cancel: "workspace.browser.downloads.page.cancel",
  remove: "workspace.browser.downloads.page.deleteFromHistory",
  retry: "workspace.browser.downloads.page.retry",
} as const satisfies Record<DownloadMenuAction, string>;

interface PageToast {
  text: string;
  /** Removals can be undone; copying a link can't. */
  canUndo: boolean;
}

function downloadsBridge() {
  return getDesktopHost()?.browser?.downloads ?? null;
}

function reportFailure(action: string) {
  return (error: unknown) => {
    console.error(`[browser-downloads] ${action} failed`, error);
  };
}

/** The card width for a page `pageWidth` wide (manager.css, item.css). */
function cardWidthFor(pageWidth: number): number {
  const clamped = Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, pageWidth * CARD_WIDTH_SHARE));
  return Math.min(clamped, pageWidth - CARD_SIDE_MARGIN);
}

/**
 * Chrome's chrome://downloads as one of the browser's own pages (paseo://downloads): the
 * downloads by day, newest first, with search, 全部清除, and a toast that undoes a removal.
 */
export function BrowserDownloadsPage({ isPresented }: { isPresented: boolean }) {
  const { t, i18n } = useTranslation();
  const downloads = useBrowserDownloadsStore((state) => state.downloads);
  const [pageWidth, setPageWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<PageToast | null>(null);
  const [menu, setMenu] = useState<{
    download: DesktopBrowserDownload;
    anchor: HTMLElement;
  } | null>(null);
  const isNarrow = pageWidth > 0 && pageWidth < NARROW_WIDTH;
  const cardWidth = cardWidthFor(pageWidth);
  const isSearching = query.trim().length > 0;
  const shown = useMemo(
    () => downloads.filter((download) => matchesSearch(download, query)),
    [downloads, query],
  );
  const now = Date.now();

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  const undo = useCallback(() => {
    setToast(null);
    void downloadsBridge()?.undoRemove().catch(reportFailure("undo"));
  }, []);

  const removeFromList = useCallback(
    (download: DesktopBrowserDownload) => {
      const isStillOnDevice = download.state === "complete" && !download.isFileMissing;
      const key = isStillOnDevice
        ? "workspace.browser.downloads.page.deletedStillOnDevice"
        : "workspace.browser.downloads.page.deleted";
      setToast({ text: t(key, { name: download.fileName }), canUndo: true });
      void downloadsBridge()?.remove(download.id).catch(reportFailure("remove"));
    },
    [t],
  );
  const clearAll = useCallback(() => {
    setToast({ text: t("workspace.browser.downloads.page.clearedAll"), canUndo: true });
    void downloadsBridge()?.clearAll().catch(reportFailure("clear all"));
  }, [t]);
  const copyLink = useCallback(
    (download: DesktopBrowserDownload) => {
      const isDataUrl = download.url.startsWith("data:");
      Clipboard.setStringAsync(download.url)
        .then(() => {
          const text = isDataUrl
            ? t("workspace.browser.downloads.page.copiedDataLink")
            : t("workspace.browser.downloads.page.copiedLink", { url: download.url });
          setToast({ text, canUndo: false });
          return undefined;
        })
        .catch((error: unknown) => {
          console.error("[browser-downloads] copy link failed", error);
          setToast({ text: t("workspace.browser.downloads.page.copyFailed"), canUndo: false });
        });
    },
    [t],
  );
  const openFile = useCallback((download: DesktopBrowserDownload) => {
    void downloadsBridge()?.open(download.id).catch(reportFailure("open"));
  }, []);

  const handleButton = useCallback(
    (download: DesktopBrowserDownload, button: DownloadCardButton, anchor: HTMLElement | null) => {
      if (button === "copyLink") copyLink(download);
      if (button === "remove") removeFromList(download);
      if (button === "showInFolder") {
        void downloadsBridge()?.showInFolder(download.id).catch(reportFailure("show in folder"));
      }
      if (button === "moreActions" && anchor) setMenu({ download, anchor });
    },
    [copyLink, removeFromList],
  );
  const runMenuAction = useCallback(
    (download: DesktopBrowserDownload, action: DownloadMenuAction) => {
      setMenu(null);
      const bridge = downloadsBridge();
      if (action === "remove") {
        removeFromList(download);
        return;
      }
      void bridge?.[action](download.id).catch(reportFailure(action));
    },
    [removeFromList],
  );
  const closeMenu = useCallback(() => setMenu(null), []);

  // manager.ts: ⌘Z undoes the last removal, except while typing in the search field.
  useEffect(() => {
    if (!isPresented) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const isUndo = event.key.toLowerCase() === "z" && event.metaKey && !event.shiftKey;
      const isTyping = event.target instanceof HTMLInputElement;
      if (!isUndo || isTyping) {
        return;
      }
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPresented, undo]);

  const isClearAllShown = hasClearableDownloads(downloads) && !isSearching;
  const clearAllButton = useMemo(
    () =>
      isClearAllShown ? (
        <CrButton
          label={t("workspace.browser.downloads.page.clearAll")}
          onPress={clearAll}
          testID="downloads-clear-all"
        />
      ) : null,
    [clearAll, isClearAllShown, t],
  );
  const chooseMenuAction = useCallback(
    (action: DownloadMenuAction) => {
      if (menu) runMenuAction(menu.download, action);
    },
    [menu, runMenuAction],
  );
  const dismissToast = useCallback(() => setToast(null), []);
  const cardColumn = useMemo(() => ({ width: cardWidth }), [cardWidth]);

  return (
    <View style={styles.page} onLayout={handleLayout} testID="browser-downloads-page">
      <CrToolbar
        title={t("workspace.browser.downloads.page.title")}
        searchLabel={t("workspace.browser.downloads.page.search")}
        clearSearchLabel={t("workspace.browser.downloads.page.clearSearch")}
        trailing={clearAllButton}
        isNarrow={isNarrow}
        onSearchChange={setQuery}
      />
      {shown.length === 0 ? (
        <View style={styles.empty}>
          {isSearching ? null : <NoDownloadsIllustration height={EMPTY_ILLUSTRATION_HEIGHT} />}
          <Text style={styles.emptyText}>
            {isSearching
              ? t("workspace.browser.downloads.page.noResults")
              : t("workspace.browser.downloads.page.empty")}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroller} contentContainerStyle={styles.list}>
          {shown.map((download, index) => (
            <View key={download.id} style={cardColumn}>
              {startsNewDay(shown, index) ? (
                <Text style={styles.date}>
                  {pageDateHeader(download.startTime, now, t, i18n.language)}
                </Text>
              ) : null}
              <DownloadCard download={download} onOpen={openFile} onButton={handleButton} />
            </View>
          ))}
        </ScrollView>
      )}
      {menu ? (
        <ActionMenu
          anchor={menu.anchor}
          items={cardMenuActions(menu.download).map((action) => ({
            action,
            label: t(MENU_LABEL_KEYS[action]),
          }))}
          onChoose={chooseMenuAction}
          onClose={closeMenu}
        />
      ) : null}
      {toast ? (
        <PageToastView
          toast={toast}
          maxWidth={cardWidth}
          undoLabel={t("workspace.browser.downloads.page.undo")}
          onUndo={undo}
          onDismiss={dismissToast}
        />
      ) : null}
    </View>
  );
}

/** cr-action-menu: its top-right corner sits on the ⋮ button's top-right corner. */
function ActionMenu({
  anchor,
  items,
  onChoose,
  onClose,
}: {
  anchor: HTMLElement;
  items: readonly { action: DownloadMenuAction; label: string }[];
  onChoose: (action: DownloadMenuAction) => void;
  onClose: () => void;
}) {
  const layer = useOverlayLayer("floating");
  const bounds = anchor.getBoundingClientRect();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);
  const position = { top: bounds.top, right: window.innerWidth - bounds.right };
  return createPortal(
    <View style={[styles.menuLayer, { zIndex: layer }]}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} />
      <View style={[styles.menu, position]} accessibilityRole="menu" testID="downloads-action-menu">
        {items.map((item) => (
          <ActionMenuItem key={item.action} item={item} onChoose={onChoose} />
        ))}
      </View>
    </View>,
    getOverlayRoot(),
  );
}

function ActionMenuItem({
  item,
  onChoose,
}: {
  item: { action: DownloadMenuAction; label: string };
  onChoose: (action: DownloadMenuAction) => void;
}) {
  const handlePress = useCallback(() => onChoose(item.action), [item.action, onChoose]);
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={handlePress}
      style={menuItemStyle}
      testID={`downloads-menu-${item.action}`}
    >
      <Text style={styles.menuItemText}>{item.label}</Text>
    </Pressable>
  );
}

function menuItemStyle({ hovered }: HoverState) {
  return [styles.menuItem, hovered && styles.menuItemHovered];
}

/** cr-toast at the bottom left; it stays until the next click anywhere (manager.html.ts). */
function PageToastView({
  toast,
  maxWidth,
  undoLabel,
  onUndo,
  onDismiss,
}: {
  toast: PageToast;
  maxWidth: number;
  undoLabel: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const toastRef = useRef<View | null>(null);
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const node: unknown = toastRef.current;
      const isInside =
        node instanceof HTMLElement && event.target instanceof Node && node.contains(event.target);
      if (!isInside) onDismiss();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onDismiss]);
  const widthStyle = useMemo(() => ({ maxWidth }), [maxWidth]);
  return (
    <View
      ref={toastRef}
      style={[styles.toast, widthStyle]}
      role="alert"
      accessibilityLiveRegion="polite"
      testID="downloads-toast"
    >
      <Text numberOfLines={1} style={styles.toastText}>
        {toast.text}
      </Text>
      {toast.canUndo ? (
        <Pressable accessibilityRole="button" onPress={onUndo} style={styles.toastButton}>
          <Text style={styles.toastButtonText}>{undoLabel}</Text>
        </Pressable>
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
    list: {
      alignItems: "center",
      gap: 12,
      paddingBottom: 24,
    },
    // item.css: 21 above, 6 below, 8/4 padding, 14 px; the card follows 12 below in the column.
    date: {
      marginTop: 21,
      marginBottom: -6,
      paddingTop: 8,
      paddingBottom: 4,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 20,
      letterSpacing: 0.25,
      color: colors.downloadDate,
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 32,
    },
    emptyText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      fontWeight: "500",
      color: colors.emptyMessage,
    },
    menuLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    menuBackdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    menu: {
      position: "absolute",
      paddingVertical: 8,
      borderRadius: 4,
      backgroundColor: colors.actionMenu,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    menuItem: {
      height: MENU_ITEM_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    menuItemHovered: {
      backgroundColor: colors.hover,
    },
    menuItemText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.actionMenuText,
    },
    toast: {
      position: "absolute",
      left: TOAST_EDGE,
      bottom: TOAST_EDGE,
      minWidth: TOAST_MIN_WIDTH,
      height: TOAST_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.toast,
      boxShadow: "0 2px 4px rgba(0,0,0,0.28)",
    },
    toastText: {
      flexShrink: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      color: colors.toastText,
    },
    toastButton: {
      height: 36,
      marginLeft: 32,
      justifyContent: "center",
    },
    toastButtonText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      fontWeight: "500",
      color: colors.toastButton,
    },
  };
});
