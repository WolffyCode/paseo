import { createContext, useCallback, useContext, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { useEscapeKey } from "@/desktop/browser/escape-key";
import { WebUiIcon, WebUiProductLogo, type WebUiIconName } from "./icons";
import { WEBUI_LAYOUT, webUiColorProps } from "./theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const iconMappings = {
  navIcon: webUiColorProps("navIcon"),
  navHoverIcon: webUiColorProps("navHoverIcon"),
  navSelectedIcon: webUiColorProps("navSelectedIcon"),
} as const;

// .cr-nav-menu-item: a 40 dip row, the icon 23 dip in with 20 dip after it, rounded at the end.
const NAV_ITEM_MIN_HEIGHT = 40;
const NAV_ITEM_ICON_GAP = 20;
// The open-in-new mark after an item that opens another page (settings' extensions link).
const EXTERNAL_MARK_MARGIN_START = 16;
const EXTERNAL_MARK_MARGIN_END = 14;
// cr-drawer's header row: 56 dip over its 1 dip line.
const DRAWER_HEADER_HEIGHT = 56;
const DRAWER_HEADER_BORDER = 1;
// :host-context(cr-drawer) .cr-nav-menu-item: in a drawer an item ends 8 dip before its edge.
const DRAWER_ITEM_MARGIN_END = 8;

const DrawerContext = createContext(false);

/** A nav item's glyph: one of the WebUI icons, or the product's mark (cr:chrome-product). */
export type CrNavMenuIconName = WebUiIconName | "product";

function NavIcon({ name, color }: { name: CrNavMenuIconName; color: keyof typeof iconMappings }) {
  if (name === "product") {
    return <WebUiProductLogo size={WEBUI_LAYOUT.iconSize} color={color} />;
  }
  return (
    <ThemedWebUiIcon name={name} size={WEBUI_LAYOUT.iconSize} uniProps={iconMappings[color]} />
  );
}

function iconColor(isSelected: boolean, isHovered: boolean): keyof typeof iconMappings {
  if (isSelected) return "navSelectedIcon";
  return isHovered ? "navHoverIcon" : "navIcon";
}

/**
 * .cr-nav-menu-item, the row of a WebUI page's left menu (settings-menu, extensions-sidebar).
 * Without `onPress` it is the page shown, not a link.
 */
export function CrNavMenuItem({
  icon,
  label,
  isSelected,
  isExternal = false,
  onPress,
  testID,
}: {
  icon: CrNavMenuIconName;
  label: string;
  isSelected: boolean;
  /** Opens elsewhere, as settings' 扩展程序 opens a new tab: ends in open-in-new. */
  isExternal?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const isInDrawer = useContext(DrawerContext);
  const itemStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.item,
      isInDrawer && styles.itemInDrawer,
      isSelected ? styles.itemSelected : hovered && styles.itemHovered,
    ],
    [isInDrawer, isSelected],
  );
  return (
    <Pressable
      accessibilityRole={isExternal ? "link" : "menuitem"}
      aria-current={isSelected ? "page" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={itemStyle}
      testID={testID}
    >
      {({ hovered }: HoverState) => (
        <>
          <View style={styles.icon}>
            <NavIcon name={icon} color={iconColor(isSelected, hovered === true)} />
          </View>
          <Text style={[styles.label, isSelected && styles.labelSelected]}>{label}</Text>
          {isExternal ? (
            <View style={styles.externalMark}>
              <NavIcon name="openInNewOld" color="navIcon" />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** The line between a left menu's groups. */
export function CrNavMenuSeparator({ variant }: { variant: "settings" | "extensions" }) {
  return (
    <View
      style={[
        styles.separator,
        variant === "settings" ? styles.settingsSeparator : styles.extensionsSeparator,
      ]}
    />
  );
}

/** cr-drawer: a narrow page's left menu, sliding in over it from the start edge. */
export function CrDrawer({
  heading,
  onClose,
  testID,
  children,
}: {
  heading: string;
  onClose: () => void;
  testID?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  // cr-drawer is a modal <dialog>: Esc cancels it.
  useEscapeKey(onClose, "bubble");
  return (
    <View style={styles.drawerLayer} testID={testID}>
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
          <Text style={styles.drawerHeading}>{heading}</Text>
        </View>
        <DrawerContext.Provider value>{children}</DrawerContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    item: {
      minHeight: NAV_ITEM_MIN_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingLeft: 23,
      paddingRight: 16,
      marginLeft: 1,
      marginRight: 2,
      borderTopRightRadius: 100,
      borderBottomRightRadius: 100,
    },
    itemInDrawer: {
      marginRight: DRAWER_ITEM_MARGIN_END,
    },
    itemHovered: {
      backgroundColor: colors.navHover,
    },
    itemSelected: {
      backgroundColor: colors.navSelected,
    },
    icon: {
      marginRight: NAV_ITEM_ICON_GAP,
    },
    label: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 14,
      color: colors.navText,
    },
    labelSelected: {
      color: colors.navSelectedText,
    },
    externalMark: {
      marginLeft: EXTERNAL_MARK_MARGIN_START,
      marginRight: EXTERNAL_MARK_MARGIN_END,
    },
    separator: {
      marginVertical: 8,
      borderTopWidth: 1,
    },
    settingsSeparator: {
      borderTopColor: colors.settingsMenuSeparator,
    },
    extensionsSeparator: {
      borderTopColor: colors.separator,
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
      minHeight: DRAWER_HEADER_HEIGHT + DRAWER_HEADER_BORDER,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 24,
      borderBottomWidth: DRAWER_HEADER_BORDER,
      borderBottomColor: colors.separator,
    },
    drawerLogo: {
      marginRight: 16,
    },
    drawerHeading: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.text,
    },
  };
});
