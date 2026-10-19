import { useCallback } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrLinkedText, LINK_SLOT } from "@/desktop/browser/webui/controls";
import { ChromeWebStoreIcon } from "@/desktop/browser/webui/icons";
import { CrDrawer, CrNavMenuItem, CrNavMenuSeparator } from "@/desktop/browser/webui/nav-menu";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";

const WEB_STORE_ICON_SIZE = 24;

/**
 * The extensions page sidebar (extensions-sidebar): "My extensions", always the page shown here,
 * then the way to the Chrome Web Store. Keyboard shortcuts and site permissions pages are not
 * part of this browser.
 */
export function ExtensionsSidebar({ onOpenWebStore }: { onOpenWebStore: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.sidebar} testID="browser-extensions-sidebar">
      <View style={styles.menu}>
        <CrNavMenuItem
          icon="myExtensions"
          label={t("workspace.browser.extensions.page.sidebarExtensions")}
          isSelected
        />
      </View>
      <CrNavMenuSeparator variant="extensions" />
      <View style={styles.discoverRow}>
        <View style={styles.webStoreIcon}>
          <ChromeWebStoreIcon size={WEB_STORE_ICON_SIZE} />
        </View>
        <CrLinkedText
          text={t("workspace.browser.extensions.page.discoverMore", { link: LINK_SLOT })}
          linkLabel={t("workspace.browser.extensions.page.discoverMoreLink")}
          onLinkPress={onOpenWebStore}
          style={styles.discoverText}
        />
      </View>
    </View>
  );
}

/** The extensions page's sidebar in a drawer, for a narrow page. */
export function ExtensionsDrawer({
  onClose,
  onOpenWebStore,
}: {
  onClose: () => void;
  onOpenWebStore: () => void;
}) {
  const { t } = useTranslation();
  const openWebStore = useCallback(() => {
    onClose();
    onOpenWebStore();
  }, [onClose, onOpenWebStore]);
  return (
    <CrDrawer
      heading={t("workspace.browser.extensions.page.title")}
      onClose={onClose}
      testID="browser-extensions-drawer"
    >
      <ExtensionsSidebar onOpenWebStore={openWebStore} />
    </CrDrawer>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    sidebar: {
      width: WEBUI_LAYOUT.sidebarWidth,
    },
    menu: {
      paddingTop: 8,
    },
    // The web store line sits in a .cr-nav-menu-item box that isn't a link itself.
    discoverRow: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
      paddingVertical: 10,
      paddingLeft: 23,
      paddingRight: 16,
      marginLeft: 1,
      marginRight: 2,
    },
    webStoreIcon: {
      marginLeft: -2,
      marginRight: -2,
    },
    discoverText: {
      flex: 1,
      marginRight: 10,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 19,
      color: colors.textSecondary,
    },
  };
});
