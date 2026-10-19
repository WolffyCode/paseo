import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
  type TextInputKeyPressEventData,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { ChromeIcon, type ChromeIconName } from "@/desktop/browser/chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "@/desktop/browser/chrome-theme";
import { useElementBounds } from "@/desktop/browser/use-element-bounds";
import { useBrowserDialogHost } from "./dialog-host";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";

/** The webview methods find in page uses (Electron's <webview> tag). */
export interface FindableWebview extends HTMLElement {
  findInPage?: (text: string, options?: { forward?: boolean; findNext?: boolean }) => number;
  stopFindInPage?: (action: "clearSelection" | "keepSelection" | "activateSelection") => void;
}

interface FindResult {
  activeMatch: number;
  matchCount: number;
}

// FindBarView geometry (chrome/browser/ui/views/find_bar_view.cc, chrome_layout_provider.cc):
// kFindBarViewRadius is the small shape (8), INSETS_TOAST minus the textfield hover padding
// leaves 12 at the ends, and image buttons are 20 dip glyphs in 28 dip targets 8 apart.
const FIND_BAR_RADIUS = 8;
const FIND_BAR_HEIGHT = 44;
const FIND_BAR_PADDING = 12;
const FIND_BAR_ANCHOR_INSET = 16;
const FIND_BAR_TOP_GAP = 4;
// The textfield's default width is 30 characters of the 13 px UI font.
const FIND_FIELD_WIDTH = 210;
const BUTTON_SIZE = 28;
const BUTTON_MARGIN = 4;
const ICON_SIZE = 20;
const SEPARATOR_HEIGHT = 20;

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const iconMapping = chromeColorProps("findBarIcon");
const disabledIconMapping = chromeColorProps("findBarIconDisabled");

function FindBarButton({
  icon,
  label,
  isDisabled = false,
  onPress,
  testID,
}: {
  icon: ChromeIconName;
  label: string;
  isDisabled?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.button,
      (hovered || pressed) && !isDisabled && styles.buttonHovered,
    ],
    [isDisabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={buttonStyle}
      testID={testID}
    >
      <ThemedChromeIcon
        name={icon}
        size={ICON_SIZE}
        uniProps={isDisabled ? disabledIconMapping : iconMapping}
      />
    </Pressable>
  );
}

/**
 * Chrome's find bar: it hangs at the top right of the page, searches as you type, and steps
 * through matches with Enter and Shift+Enter. Escape closes it and keeps the found text selected.
 */
export function BrowserFindBar({
  webview,
  initialQuery,
  onQueryChange,
  onClose,
}: {
  webview: FindableWebview | null;
  initialQuery: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const host = useBrowserDialogHost();
  const hostBounds = useElementBounds(host);
  const layer = useOverlayLayer("floating");
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<FindResult | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const search = useCallback(
    (text: string) => {
      if (!text) {
        webview?.stopFindInPage?.("clearSelection");
        setResult(null);
        return;
      }
      webview?.findInPage?.(text, { findNext: true });
    },
    [webview],
  );

  useEffect(() => {
    if (!webview) return;
    const handleFound = (event: Event) => {
      const found = (
        event as Event & {
          result?: { activeMatchOrdinal?: number; matches?: number };
        }
      ).result;
      if (!found) return;
      setResult({ activeMatch: found.activeMatchOrdinal ?? 0, matchCount: found.matches ?? 0 });
    };
    webview.addEventListener("found-in-page", handleFound);
    return () => webview.removeEventListener("found-in-page", handleFound);
  }, [webview]);

  // Chrome reopens the bar with the last search selected and its matches shown again.
  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.replaceText(queryRef.current, { start: 0, end: queryRef.current.length });
    search(queryRef.current);
  }, [search]);

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      onQueryChange(text);
      search(text);
    },
    [onQueryChange, search],
  );
  const findAgain = useCallback(
    (isForward: boolean) => {
      if (!queryRef.current) return;
      webview?.findInPage?.(queryRef.current, { forward: isForward, findNext: false });
    },
    [webview],
  );
  const findPrevious = useCallback(() => findAgain(false), [findAgain]);
  const findNext = useCallback(() => findAgain(true), [findAgain]);
  const close = useCallback(() => {
    webview?.stopFindInPage?.("keepSelection");
    onClose();
  }, [onClose, webview]);
  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean }>) => {
      const { key, shiftKey } = event.nativeEvent;
      if (key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        findAgain(!shiftKey);
      }
    },
    [close, findAgain],
  );

  if (!hostBounds) {
    return null;
  }
  const hasMatches = (result?.matchCount ?? 0) > 0;
  const position = {
    top: hostBounds.top + FIND_BAR_TOP_GAP,
    right: window.innerWidth - (hostBounds.left + hostBounds.width) + FIND_BAR_ANCHOR_INSET,
  };
  return createPortal(
    <View style={[styles.layer, { zIndex: layer }]} pointerEvents="box-none">
      <View style={[styles.bar, position]} testID="browser-find-bar">
        <EditingTextInput
          ref={inputRef}
          accessibilityLabel={t("workspace.browser.find.label")}
          initialValue={initialQuery}
          onChangeText={handleChangeText}
          onKeyPress={handleKeyPress}
          style={styles.field}
          testID="browser-find-input"
        />
        <Text style={styles.count} testID="browser-find-count">
          {result && query
            ? t("workspace.browser.find.count", {
                active: result.activeMatch,
                total: result.matchCount,
              })
            : ""}
        </Text>
        <View style={styles.separator} />
        <FindBarButton
          icon="findPrevious"
          label={t("workspace.browser.find.previous")}
          isDisabled={!hasMatches}
          onPress={findPrevious}
          testID="browser-find-previous"
        />
        <FindBarButton
          icon="findNext"
          label={t("workspace.browser.find.next")}
          isDisabled={!hasMatches}
          onPress={findNext}
          testID="browser-find-next"
        />
        <FindBarButton
          icon="close"
          label={t("workspace.browser.find.close")}
          onPress={close}
          testID="browser-find-close"
        />
      </View>
    </View>,
    getOverlayRoot(),
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    layer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    bar: {
      position: "absolute",
      height: FIND_BAR_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: FIND_BAR_PADDING,
      borderRadius: FIND_BAR_RADIUS,
      backgroundColor: chrome.bubble,
      boxShadow: `0 0 12px rgba(${chrome.dropdownShadowRgb},0.08), 0 12px 16px rgba(${chrome.dropdownShadowRgb},0.18)`,
    },
    field: {
      width: FIND_FIELD_WIDTH,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      color: chrome.bubbleText,
      outlineWidth: 0,
    },
    count: {
      minWidth: 40,
      marginHorizontal: 8,
      textAlign: "right",
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      color: chrome.bubbleTextSecondary,
    },
    separator: {
      width: 1,
      height: SEPARATOR_HEIGHT,
      marginHorizontal: 8,
      backgroundColor: chrome.menuSeparator,
    },
    button: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      marginHorizontal: BUTTON_MARGIN,
      borderRadius: BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonHovered: {
      backgroundColor: chrome.toolbarHover,
    },
  };
});
