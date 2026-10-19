import { useCallback, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  getDesktopHost,
  type DesktopBrowserExtension,
  type DesktopBrowserExtensionAction,
} from "@/desktop/host";
import { ChromeBubble } from "@/desktop/browser/chrome-bubble";
import {
  ChromeDialogButton,
  ChromeToolbarButton,
  ChromeToolbarDivider,
} from "@/desktop/browser/chrome-controls";
import { ChromeDialog } from "@/desktop/browser/chrome-dialog";
import { ChromeIcon } from "@/desktop/browser/chrome-icons";
import {
  CHROME_FONT_FAMILY,
  CHROME_LAYOUT,
  chromeColorProps,
} from "@/desktop/browser/chrome-theme";
import { getBrowserGuestWebContentsId } from "@/desktop/browser/resident-webviews";
import { BROWSER_EXTENSIONS_URL, extensionDetailsUrl } from "@/desktop/browser/internal-pages";
import { openBrowserFromPage } from "@/desktop/browser/workspace-browsers";
import {
  actionDetailsForTab,
  actionIconUrl,
  badgeBackgroundColor,
  badgeTextColor,
} from "./action-state";
import { useBrowserExtensionPinsStore, useBrowserExtensionsStore } from "./store";
import { CHROME_WEB_STORE_EXTENSIONS_URL, chromeWebStoreDetailUrl } from "./web-store";
import { PRODUCT_NAME } from "@/constants/product";

// Chrome's extensions menu is 320 dip wide.
const EXTENSIONS_MENU_WIDTH = 320;

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const toolbarIconMapping = chromeColorProps("toolbarIcon");
const menuIconMapping = chromeColorProps("menuIcon");

function elementRect(view: View | null): { x: number; y: number; width: number; height: number } {
  // On web a View's ref is its DOM element.
  const rect = (view as unknown as HTMLElement | null)?.getBoundingClientRect();
  return { x: rect?.x ?? 0, y: rect?.y ?? 0, width: rect?.width ?? 0, height: rect?.height ?? 0 };
}

function openInNewTab(sourceBrowserId: string, url: string): void {
  openBrowserFromPage({ sourceBrowserId, url, isActive: true });
}

/** Clicks an extension's action as Chrome does: its popup opens under `anchor`. */
function activateExtension(input: {
  extensionId: string;
  browserId: string;
  anchor: View | null;
}): void {
  const extensionsBridge = getDesktopHost()?.browser?.extensions;
  const tabId = getBrowserGuestWebContentsId(input.browserId);
  if (!extensionsBridge || tabId === null) {
    return;
  }
  void extensionsBridge
    .activateAction({
      eventType: "click",
      extensionId: input.extensionId,
      tabId,
      anchorRect: elementRect(input.anchor),
    })
    .catch((error: unknown) => {
      console.error("[browser-extensions] activate failed", error);
    });
}

type ExtensionMenuChoice = "homepage" | "pin" | "options" | "remove" | "manage";

/**
 * Chrome's right-click menu for an extension (ExtensionContextMenuModel), shown natively as on
 * macOS. Site access rows are left out: the browser grants extensions their hosts at install.
 */
async function chooseFromExtensionMenu(input: {
  t: TFunction;
  extension: DesktopBrowserExtension;
  isPinned: boolean;
}): Promise<ExtensionMenuChoice | null> {
  const popup = getDesktopHost()?.menu?.popup;
  if (!popup) {
    return null;
  }
  const { t, extension, isPinned } = input;
  const chosen = await popup({
    items: [
      { id: "homepage", label: extension.name },
      { kind: "separator" },
      {
        id: "pin",
        label: isPinned
          ? t("workspace.browser.extensions.unpinFromToolbar")
          : t("workspace.browser.extensions.pinToToolbar"),
      },
      ...(extension.optionsUrl
        ? [{ id: "options", label: t("workspace.browser.extensions.options") }]
        : []),
      {
        id: "remove",
        label: t("workspace.browser.extensions.remove", { product: PRODUCT_NAME }),
      },
      { kind: "separator" },
      { id: "manage", label: t("workspace.browser.extensions.manageExtension") },
    ],
  });
  return chosen as ExtensionMenuChoice | null;
}

/** Runs what the user picked in an extension's menu. Removal asks first, so it is handed back. */
function useExtensionMenu(
  browserId: string,
  onRequestRemove: (extension: DesktopBrowserExtension) => void,
  onShowExtensionsPage: (url: string) => void,
) {
  const { t } = useTranslation();
  const setPinned = useBrowserExtensionPinsStore((state) => state.setPinned);
  return useCallback(
    async (extension: DesktopBrowserExtension, isPinned: boolean) => {
      const choice = await chooseFromExtensionMenu({ t, extension, isPinned });
      if (choice === "homepage") {
        // Chrome's GetHomepageURL: the extension's website, else its Chrome Web Store page.
        openInNewTab(browserId, extension.websiteUrl ?? chromeWebStoreDetailUrl(extension.id));
      } else if (choice === "pin") {
        setPinned(extension.id, !isPinned);
      } else if (choice === "options" && extension.optionsUrl) {
        openInNewTab(browserId, extension.optionsUrl);
      } else if (choice === "remove") {
        onRequestRemove(extension);
      } else if (choice === "manage") {
        onShowExtensionsPage(extensionDetailsUrl(extension.id));
      }
    },
    [browserId, onRequestRemove, onShowExtensionsPage, setPinned, t],
  );
}

function ExtensionActionIcon({
  extension,
  action,
  browserId,
  size,
}: {
  extension: DesktopBrowserExtension;
  action: DesktopBrowserExtensionAction | undefined;
  browserId: string;
  size: number;
}) {
  const partition = getDesktopHost()?.browser?.profilePartition;
  const tabId = getBrowserGuestWebContentsId(browserId);
  const details = action ? actionDetailsForTab(action, tabId) : null;
  // An extension without a toolbar action still has its manifest icon.
  const iconUri =
    action && partition
      ? actionIconUrl({
          extensionId: extension.id,
          tabId,
          partition,
          iconModified: details?.iconModified,
        })
      : extension.iconDataUrl;
  const badgeBackground = badgeBackgroundColor(details?.color);
  const iconStyle = useMemo(() => ({ width: size, height: size }), [size]);
  const iconSource = useMemo(() => (iconUri ? { uri: iconUri } : null), [iconUri]);
  return (
    <View style={styles.actionIconFrame}>
      {iconSource ? <Image source={iconSource} style={iconStyle} /> : null}
      {details?.text ? (
        <View style={[styles.badge, badgeBackground ? { backgroundColor: badgeBackground } : null]}>
          <Text
            numberOfLines={1}
            style={[
              styles.badgeText,
              badgeBackground ? { color: badgeTextColor(badgeBackground) } : null,
            ]}
          >
            {details.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ExtensionActionButton({
  extension,
  action,
  browserId,
  onShowMenu,
}: {
  extension: DesktopBrowserExtension;
  action: DesktopBrowserExtensionAction | undefined;
  browserId: string;
  onShowMenu: (extension: DesktopBrowserExtension, isPinned: boolean) => void;
}) {
  const buttonRef = useRef<View>(null);
  const tabId = getBrowserGuestWebContentsId(browserId);
  const title = action ? actionDetailsForTab(action, tabId).title : undefined;
  const handlePress = useCallback(() => {
    activateExtension({ extensionId: extension.id, browserId, anchor: buttonRef.current });
  }, [browserId, extension.id]);
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      onShowMenu(extension, true);
    },
    [extension, onShowMenu],
  );
  return (
    <ChromeToolbarButton
      ref={buttonRef}
      label={title || extension.name}
      onPress={handlePress}
      onContextMenu={handleContextMenu}
      testID={`browser-extension-action-${extension.id}`}
    >
      <ExtensionActionIcon
        extension={extension}
        action={action}
        browserId={browserId}
        size={CHROME_LAYOUT.extensionIconSize}
      />
    </ChromeToolbarButton>
  );
}

function ExtensionsMenuRow({
  extension,
  action,
  browserId,
  isPinned,
  anchor,
  onShowMenu,
  onClose,
}: {
  extension: DesktopBrowserExtension;
  action: DesktopBrowserExtensionAction | undefined;
  browserId: string;
  isPinned: boolean;
  anchor: View | null;
  onShowMenu: (extension: DesktopBrowserExtension, isPinned: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => {
    onClose();
    activateExtension({ extensionId: extension.id, browserId, anchor });
  }, [anchor, browserId, extension.id, onClose]);
  const handleMore = useCallback(() => {
    onShowMenu(extension, isPinned);
  }, [extension, isPinned, onShowMenu]);
  // Chrome shows the pin on a pinned extension's menu button and the three dots on hover.
  const moreIcon = isPinned && !isHovered ? "keep" : "appMenu";
  return (
    <View
      style={styles.menuRowHoverTarget}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      testID={`browser-extensions-menu-row-${extension.id}`}
    >
      <Pressable accessibilityRole="button" onPress={handlePress} style={menuRowStyle}>
        <ExtensionActionIcon
          extension={extension}
          action={action}
          browserId={browserId}
          size={CHROME_LAYOUT.extensionIconSize}
        />
        <Text numberOfLines={1} style={styles.menuRowLabel}>
          {extension.name}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("workspace.browser.extensions.moreOptions")}
        onPress={handleMore}
        style={menuRowMoreStyle}
        testID={`browser-extensions-menu-more-${extension.id}`}
      >
        <ThemedChromeIcon name={moreIcon} size={16} uniProps={menuIconMapping} />
      </Pressable>
    </View>
  );
}

function ExtensionsMenuLink({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: "settings" | "extensions";
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={menuLinkStyle} testID={testID}>
      <ThemedChromeIcon name={icon} size={16} uniProps={menuIconMapping} />
      <Text style={styles.menuLinkLabel}>{label}</Text>
    </Pressable>
  );
}

/** Chrome's puzzle-piece bubble: every extension, its menu, and links to find and manage more. */
function ExtensionsMenu({
  anchor,
  browserId,
  extensions,
  actions,
  pinnedExtensionIds,
  onShowMenu,
  onShowExtensionsPage,
  onClose,
}: {
  anchor: View | null;
  browserId: string;
  extensions: readonly DesktopBrowserExtension[];
  actions: readonly DesktopBrowserExtensionAction[];
  pinnedExtensionIds: readonly string[];
  onShowMenu: (extension: DesktopBrowserExtension, isPinned: boolean) => void;
  onShowExtensionsPage: (url: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sortedExtensions = useMemo(
    () => [...extensions].sort((left, right) => left.name.localeCompare(right.name)),
    [extensions],
  );
  const handleDiscover = useCallback(() => {
    onClose();
    openInNewTab(browserId, CHROME_WEB_STORE_EXTENSIONS_URL);
  }, [browserId, onClose]);
  const handleManage = useCallback(() => {
    onClose();
    onShowExtensionsPage(BROWSER_EXTENSIONS_URL);
  }, [onClose, onShowExtensionsPage]);
  return (
    <ChromeBubble
      anchor={anchor as unknown as HTMLElement | null}
      width={EXTENSIONS_MENU_WIDTH}
      onClose={onClose}
      testID="browser-extensions-menu"
    >
      <View style={styles.menuHeader}>
        <Text style={styles.menuTitle}>{t("workspace.browser.extensions.menuTitle")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.close")}
          onPress={onClose}
          style={menuCloseStyle}
        >
          <ThemedChromeIcon name="close" size={16} uniProps={menuIconMapping} />
        </Pressable>
      </View>
      <View style={styles.menuRows}>
        {sortedExtensions.map((extension) => (
          <ExtensionsMenuRow
            key={extension.id}
            extension={extension}
            action={actions.find((candidate) => candidate.id === extension.id)}
            browserId={browserId}
            isPinned={pinnedExtensionIds.includes(extension.id)}
            anchor={anchor}
            onShowMenu={onShowMenu}
            onClose={onClose}
          />
        ))}
      </View>
      <View style={styles.menuFooter}>
        <ExtensionsMenuLink
          icon="extensions"
          label={t("workspace.browser.extensions.discover")}
          onPress={handleDiscover}
          testID="browser-extensions-menu-discover"
        />
        <ExtensionsMenuLink
          icon="settings"
          label={t("workspace.browser.extensions.manage")}
          onPress={handleManage}
          testID="browser-extensions-menu-manage"
        />
      </View>
    </ChromeBubble>
  );
}

/** Chrome's "Remove extension?" dialog. */
export function ExtensionUninstallDialog({
  extension,
  onClose,
}: {
  extension: DesktopBrowserExtension;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setPinned = useBrowserExtensionPinsStore((state) => state.setPinned);
  const handleRemove = useCallback(() => {
    onClose();
    setPinned(extension.id, false);
    void getDesktopHost()
      ?.browser?.extensions?.remove(extension.id)
      .catch((error: unknown) => {
        console.error("[browser-extensions] remove failed", error);
      });
  }, [extension.id, onClose, setPinned]);
  return (
    <ChromeDialog
      title={t("workspace.browser.extensions.uninstall.title", { name: extension.name })}
      iconUri={extension.iconDataUrl}
      onEscape={onClose}
      testID="browser-extension-uninstall-dialog"
      buttons={
        <>
          <ChromeDialogButton
            variant="tonal"
            label={t("common.actions.cancel")}
            onPress={onClose}
          />
          <ChromeDialogButton
            variant="prominent"
            label={t("workspace.browser.extensions.uninstall.remove")}
            onPress={handleRemove}
            testID="browser-extension-uninstall-confirm"
          />
        </>
      }
    />
  );
}

/**
 * The extension part of Chrome's toolbar: pinned extensions, the puzzle-piece menu, then a
 * divider. Chrome shows none of it until an extension is installed.
 */
export function BrowserExtensionsToolbar({
  browserId,
  onShowExtensionsPage,
}: {
  browserId: string;
  /** Opens one of the extensions pages the way Chrome's ShowExtensions does. */
  onShowExtensionsPage: (url: string) => void;
}) {
  const { t } = useTranslation();
  const extensions = useBrowserExtensionsStore((state) => state.extensions);
  const actions = useBrowserExtensionsStore((state) => state.actions);
  const pinnedExtensionIds = useBrowserExtensionPinsStore((state) => state.pinnedExtensionIds);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [extensionPendingRemoval, setExtensionPendingRemoval] =
    useState<DesktopBrowserExtension | null>(null);
  const menuButtonRef = useRef<View>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const toggleMenu = useCallback(() => setIsMenuOpen((isOpen) => !isOpen), []);
  const closeRemoval = useCallback(() => setExtensionPendingRemoval(null), []);
  const showExtensionMenu = useExtensionMenu(
    browserId,
    setExtensionPendingRemoval,
    onShowExtensionsPage,
  );
  const handleShowMenu = useCallback(
    (extension: DesktopBrowserExtension, isPinned: boolean) => {
      void showExtensionMenu(extension, isPinned);
    },
    [showExtensionMenu],
  );
  const pinnedExtensions = useMemo(
    () =>
      pinnedExtensionIds
        .map((extensionId) => extensions.find((extension) => extension.id === extensionId))
        .filter((extension): extension is DesktopBrowserExtension => extension !== undefined),
    [extensions, pinnedExtensionIds],
  );

  if (extensions.length === 0) {
    return null;
  }
  return (
    <View style={styles.toolbar}>
      {pinnedExtensions.map((extension) => (
        <ExtensionActionButton
          key={extension.id}
          extension={extension}
          action={actions.find((candidate) => candidate.id === extension.id)}
          browserId={browserId}
          onShowMenu={handleShowMenu}
        />
      ))}
      <ChromeToolbarButton
        ref={menuButtonRef}
        label={t("workspace.browser.extensions.menuTitle")}
        isActive={isMenuOpen}
        onPress={toggleMenu}
        testID="browser-extensions-button"
      >
        <ThemedChromeIcon
          name="extensions"
          size={CHROME_LAYOUT.toolbarIconSize}
          uniProps={toolbarIconMapping}
        />
      </ChromeToolbarButton>
      <ChromeToolbarDivider />
      {isMenuOpen ? (
        <ExtensionsMenu
          anchor={menuButtonRef.current}
          browserId={browserId}
          extensions={extensions}
          actions={actions}
          pinnedExtensionIds={pinnedExtensionIds}
          onShowMenu={handleShowMenu}
          onShowExtensionsPage={onShowExtensionsPage}
          onClose={closeMenu}
        />
      ) : null}
      {extensionPendingRemoval ? (
        <ExtensionUninstallDialog extension={extensionPendingRemoval} onClose={closeRemoval} />
      ) : null}
    </View>
  );
}

type HoverState = PressableStateCallbackType & { hovered?: boolean };

function menuRowStyle({ hovered }: HoverState) {
  return [styles.menuRow, hovered && styles.menuRowHovered];
}

function menuRowMoreStyle({ hovered }: HoverState) {
  return [styles.menuRowMore, hovered && styles.menuRowHovered];
}

function menuLinkStyle({ hovered }: HoverState) {
  return [styles.menuRow, styles.menuLink, hovered && styles.menuRowHovered];
}

function menuCloseStyle({ hovered }: HoverState) {
  return [styles.menuClose, hovered && styles.menuRowHovered];
}

const BADGE_HEIGHT = 14;

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    toolbar: {
      flexDirection: "row",
      alignItems: "center",
      gap: CHROME_LAYOUT.toolbarButtonSpacing,
    },
    actionIconFrame: {
      width: CHROME_LAYOUT.toolbarIconSize,
      height: CHROME_LAYOUT.toolbarIconSize,
      alignItems: "center",
      justifyContent: "center",
    },
    badge: {
      position: "absolute",
      right: -4,
      bottom: -3,
      minWidth: BADGE_HEIGHT,
      height: BADGE_HEIGHT,
      paddingHorizontal: 2,
      borderRadius: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: chrome.extensionBadge,
    },
    badgeText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 9,
      lineHeight: BADGE_HEIGHT,
      fontWeight: "500",
      color: badgeTextColor(chrome.extensionBadge),
    },
    menuHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 16,
      paddingBottom: 8,
      paddingLeft: 20,
      paddingRight: 12,
    },
    menuTitle: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "500",
      color: chrome.bubbleText,
    },
    menuClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    menuRows: {
      paddingHorizontal: 8,
    },
    menuRowHoverTarget: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
    },
    menuRow: {
      flex: 1,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    menuRowHovered: {
      backgroundColor: chrome.toolbarHover,
    },
    menuRowLabel: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      fontWeight: "500",
      color: chrome.bubbleText,
    },
    menuRowMore: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    menuFooter: {
      marginTop: 8,
      paddingTop: 8,
      paddingBottom: 8,
      paddingHorizontal: 8,
      borderTopWidth: 1,
      borderTopColor: chrome.menuSeparator,
    },
    menuLink: {
      flex: 0,
    },
    menuLinkLabel: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      color: chrome.bubbleText,
    },
  };
});
