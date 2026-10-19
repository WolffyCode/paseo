import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChromeBubble } from "../chrome-bubble";
import { ChromeIcon, type ChromeIconName } from "../chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "../chrome-theme";
import { ProfileAvatar } from "./profile-avatar";
import { profileDisplayName, useBrowserProfileStore } from "./store";

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const rowIconMapping = chromeColorProps("menuIcon");
const litRowIconMapping = chromeColorProps("menuText");

// ProfileMenuViewBase: 328 dip wide. The identity card sits 12 dip in, with 8 dip corners: the
// 56 dip avatar 24 dip from its top, then the name 8 below it and 24 above the card's end.
const MENU_WIDTH = 328;
const IDENTITY_MARGIN = 12;
const IDENTITY_CORNER_RADIUS = 8;
const AVATAR_SIZE = 56;
const AVATAR_TOP_MARGIN = 24;
const TITLE_TOP_MARGIN = 8;
const TITLE_BOTTOM_MARGIN = 24;
const TITLE_HORIZONTAL_MARGIN = 24;
const TITLE_FONT_SIZE = 13;
const TITLE_LINE_HEIGHT = 20;
// MenuButtonRowView: 28 dip rows padded 16, the 16 dip icon 12 further in and the label 12 after
// it, in 12 px type on a 20 dip line; 8 dip under the last row.
const ROW_HEIGHT = 28;
const ROW_PADDING = 16;
const ROW_ICON_MARGIN = 12;
const ROW_ICON_SIZE = 16;
const ROW_ICON_LABEL_GAP = 12;
const ROW_FONT_SIZE = 12;
const ROW_LINE_HEIGHT = 20;
const ROWS_BOTTOM_MARGIN = 8;

function elementOf(view: View | null): HTMLElement | null {
  const node: unknown = view;
  return node instanceof HTMLElement ? node : null;
}

/**
 * A HoverButton row: it takes focus under the pointer and gives it up when the pointer leaves, so
 * hovering and the keyboard light it the same way, with no ring.
 */
function ProfileMenuRow({
  icon,
  label,
  onPress,
  registerRow,
  testID,
}: {
  icon: ChromeIconName;
  label: string;
  onPress: () => void;
  registerRow: (element: HTMLElement | null) => void;
  testID: string;
}) {
  const rowRef = useRef<View | null>(null);
  const [isLit, setIsLit] = useState(false);
  const setRowNode = useCallback(
    (node: View | null) => {
      rowRef.current = node;
      registerRow(elementOf(node));
    },
    [registerRow],
  );
  const focusRow = useCallback(() => elementOf(rowRef.current)?.focus({ preventScroll: true }), []);
  const blurRow = useCallback(() => elementOf(rowRef.current)?.blur(), []);
  const lightRow = useCallback(() => setIsLit(true), []);
  const dimRow = useCallback(() => setIsLit(false), []);
  return (
    <Pressable
      ref={setRowNode}
      role="menuitem"
      onPress={onPress}
      onHoverIn={focusRow}
      onHoverOut={blurRow}
      onFocus={lightRow}
      onBlur={dimRow}
      style={[styles.row, isLit && styles.rowLit]}
      testID={testID}
    >
      <View style={styles.rowIcon}>
        <ThemedChromeIcon
          name={icon}
          size={ROW_ICON_SIZE}
          uniProps={isLit ? litRowIconMapping : rowIconMapping}
        />
      </View>
      <Text numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Chrome's profile menu (ProfileMenuView) for one local profile with no Google sign-in: the
 * identity card with the avatar and name, then 自定义个人资料. Chrome's sign-in, sync and Google
 * Account rows need Google; 密码和自动填充 waits for passwords, and the rows for other profiles and
 * the guest profile wait for more than one profile. Nothing is focused when it opens; ↑ and ↓ move
 * through the rows.
 */
export function ProfileMenu({
  anchor,
  onCustomizeProfile,
  onClose,
}: {
  anchor: HTMLElement | null;
  onCustomizeProfile: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = useBrowserProfileStore((state) => state.name);
  const avatarId = useBrowserProfileStore((state) => state.avatarId);
  const rowElements = useRef<HTMLElement[]>([]);
  const registerCustomizeRow = useCallback((element: HTMLElement | null) => {
    rowElements.current = element ? [element] : [];
  }, []);

  // SetEnableArrowKeyTraversal: ↑ and ↓ cycle through the rows, from none on the first press.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isDown = event.key === "ArrowDown";
      if (!isDown && event.key !== "ArrowUp") return;
      const rows = rowElements.current;
      if (rows.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const focusedIndex = rows.findIndex((row) => row === document.activeElement);
      const step = isDown ? 1 : -1;
      let nextIndex = (focusedIndex + step + rows.length) % rows.length;
      if (focusedIndex < 0) {
        nextIndex = isDown ? 0 : rows.length - 1;
      }
      rows[nextIndex].focus({ preventScroll: true });
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const customizeProfile = useCallback(() => {
    onClose();
    onCustomizeProfile();
  }, [onClose, onCustomizeProfile]);

  return (
    <ChromeBubble
      anchor={anchor}
      width={MENU_WIDTH}
      onClose={onClose}
      testID="browser-profile-menu"
    >
      <View
        role="menu"
        aria-label={t("workspace.browser.profile.menuAccessibleTitle")}
        style={styles.menu}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <ProfileAvatar avatarId={avatarId} size={AVATAR_SIZE} isPadded />
          </View>
          <Text numberOfLines={1} style={styles.title} testID="browser-profile-menu-name">
            {profileDisplayName(name, t)}
          </Text>
        </View>
        <ProfileMenuRow
          icon="menuCustomize"
          label={t("workspace.browser.profile.customizeProfile")}
          onPress={customizeProfile}
          registerRow={registerCustomizeRow}
          testID="browser-profile-menu-customize"
        />
      </View>
    </ChromeBubble>
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    menu: {
      paddingBottom: ROWS_BOTTOM_MARGIN,
    },
    identity: {
      margin: IDENTITY_MARGIN,
      alignItems: "center",
      borderRadius: IDENTITY_CORNER_RADIUS,
      backgroundColor: chrome.profileIdentityCard,
    },
    avatar: {
      marginTop: AVATAR_TOP_MARGIN,
    },
    title: {
      maxWidth: MENU_WIDTH - IDENTITY_MARGIN * 2 - TITLE_HORIZONTAL_MARGIN * 2,
      marginTop: TITLE_TOP_MARGIN,
      marginBottom: TITLE_BOTTOM_MARGIN,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: "500",
      lineHeight: TITLE_LINE_HEIGHT,
      color: chrome.bubbleText,
    },
    row: {
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: ROW_PADDING,
      outlineWidth: 0,
    },
    rowLit: {
      backgroundColor: chrome.menuHovered,
    },
    rowIcon: {
      marginLeft: ROW_ICON_MARGIN,
      marginRight: ROW_ICON_LABEL_GAP,
    },
    rowLabel: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: ROW_FONT_SIZE,
      lineHeight: ROW_LINE_HEIGHT,
      color: chrome.menuText,
    },
  };
});
