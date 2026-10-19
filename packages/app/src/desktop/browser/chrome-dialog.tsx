import { useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Image, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { CHROME_FONT_FAMILY, CHROME_LAYOUT } from "./chrome-theme";
import { useElementBounds } from "./use-element-bounds";
import { useBrowserDialogHost } from "./pane/dialog-host";

// Chrome's DISTANCE_MODAL_DIALOG_PREFERRED_WIDTH and extension_misc::EXTENSION_ICON_SMALL.
const DIALOG_WIDTH = 448;
const DIALOG_ICON_SIZE = 32;
// Chrome's dialogs sit near the top of the page area, not centered vertically.
const DIALOG_TOP_OFFSET = 16;

/**
 * A Chrome dialog over the browser window's page area: icon and title, content, then buttons on
 * the right. The page below can't be used while it is open. Escape answers `onEscape`.
 */
export function ChromeDialog({
  title,
  iconUri,
  onEscape,
  buttons,
  testID,
  children,
}: {
  title: string;
  iconUri?: string | null;
  onEscape: () => void;
  buttons: ReactNode;
  testID?: string;
  children?: ReactNode;
}) {
  const host = useBrowserDialogHost();
  const hostBounds = useElementBounds(host);
  const layer = useOverlayLayer("modal");
  const iconSource = useMemo(() => (iconUri ? { uri: iconUri } : null), [iconUri]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onEscape]);

  if (!hostBounds) {
    return null;
  }
  // The overlay root passes clicks through; the dialog takes them, and so blocks the page.
  return createPortal(
    <View style={[styles.blocker, hostBounds, { zIndex: layer }]} pointerEvents="auto">
      <View style={styles.dialog} testID={testID} role="dialog" aria-modal aria-label={title}>
        <View style={styles.titleRow}>
          {iconSource ? <Image source={iconSource} style={styles.icon} /> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {children ? <View style={styles.content}>{children}</View> : null}
        <View style={styles.buttons}>{buttons}</View>
      </View>
    </View>,
    getOverlayRoot(),
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    blocker: {
      position: "absolute",
      alignItems: "center",
      paddingTop: DIALOG_TOP_OFFSET,
    },
    dialog: {
      width: DIALOG_WIDTH,
      maxWidth: "100%",
      padding: 20,
      gap: 16,
      borderRadius: CHROME_LAYOUT.dialogCornerRadius,
      backgroundColor: chrome.bubble,
      boxShadow: `0 0 12px rgba(${chrome.dropdownShadowRgb},0.08), 0 12px 16px rgba(${chrome.dropdownShadowRgb},0.18)`,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 20,
    },
    icon: {
      width: DIALOG_ICON_SIZE,
      height: DIALOG_ICON_SIZE,
    },
    title: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "500",
      color: chrome.bubbleText,
    },
    content: {
      gap: 8,
    },
    buttons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
  };
});
