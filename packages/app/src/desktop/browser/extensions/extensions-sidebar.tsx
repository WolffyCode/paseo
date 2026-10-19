import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrLinkedText, LINK_SLOT } from "@/desktop/browser/webui/controls";
import { ChromeWebStoreIcon, WebUiIcon, WebUiProductLogo } from "@/desktop/browser/webui/icons";
import { WEBUI_LAYOUT, webUiColorProps } from "@/desktop/browser/webui/theme";

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const selectedIconMapping = webUiColorProps("navSelectedIcon");
const WEB_STORE_ICON_SIZE = 24;
// cr-drawer's header row.
const DRAWER_HEADER_HEIGHT = 56;

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
        <View style={[styles.navItem, styles.navItemSelected]} aria-current="page">
          <ThemedWebUiIcon
            name="myExtensions"
            size={WEBUI_LAYOUT.iconSize}
            uniProps={selectedIconMapping}
          />
          <Text style={[styles.navLabel, styles.navLabelSelected]}>
            {t("workspace.browser.extensions.page.sidebarExtensions")}
          </Text>
        </View>
      </View>
      <View style={styles.separator} />
      <View style={styles.navItem}>
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

/** cr-drawer: the sidebar of a narrow page, sliding in over it from the start edge. */
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
    <View style={styles.drawerLayer} testID="browser-extensions-drawer">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.actions.close")}
        onPress={onClose}
        style={styles.drawerBackdrop}
      />
      <View style={styles.drawer}>
        <View style={styles.drawerHeader}>
          <View style={styles.drawerLogo}>
            <WebUiProductLogo />
          </View>
          <Text style={styles.drawerHeading}>{t("workspace.browser.extensions.page.title")}</Text>
        </View>
        <ExtensionsSidebar onOpenWebStore={openWebStore} />
      </View>
    </View>
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
    navItem: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 20,
      paddingVertical: 10,
      paddingLeft: 23,
      paddingRight: 16,
      marginLeft: 1,
      marginRight: 2,
      borderTopRightRadius: 100,
      borderBottomRightRadius: 100,
    },
    navItemSelected: {
      backgroundColor: colors.navSelected,
    },
    navLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 14,
      color: colors.navText,
    },
    navLabelSelected: {
      color: colors.navSelectedText,
    },
    separator: {
      marginVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
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
    drawerLayer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 2,
    },
    drawerBackdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.drawerBackdrop,
    },
    drawer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: WEBUI_LAYOUT.sidebarWidth,
      backgroundColor: colors.drawer,
    },
    drawerHeader: {
      minHeight: DRAWER_HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    drawerLogo: {
      marginRight: 16,
    },
    drawerHeading: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      color: colors.text,
    },
  };
});
