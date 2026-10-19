import { useCallback, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrIconButton } from "./controls";
import { WebUiIcon, WebUiProductLogo } from "./icons";
import { WEBUI_LAYOUT, webUiColorProps } from "./theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const searchIconMapping = webUiColorProps("searchFieldIcon");

// cr-toolbar-search-field: a 36 dip pill up to 680 + 2 x 6 wide, a 28 dip icon box, 12 px text.
const SEARCH_FIELD_HEIGHT = 36;
const SEARCH_FIELD_MAX_WIDTH = 692;
const SEARCH_ICON_BOX = 28;
const SEARCH_TEXT_SIZE = 12;
const SEARCH_LINE_HEIGHT = 22.2;
const TITLE_SIZE = 22.1;
const NARROW_SEARCH_BOX_WIDTH = 44;
const NARROW_SEARCH_BOX_HEIGHT = 40;
const NARROW_SEARCH_ICON_INSET = 18;

/**
 * cr-toolbar: the page title on the left, a search field in the middle, the page's own buttons
 * on the right. Narrow pages fold the search field into an icon until it is used, and a page
 * with a sidebar shows a menu button for it in place of the logo.
 */
export function CrToolbar({
  title,
  searchLabel,
  clearSearchLabel,
  menu,
  trailing,
  isNarrow,
  onSearchChange,
}: {
  title: string;
  searchLabel: string;
  clearSearchLabel: string;
  /** The sidebar's menu button, for pages that have a sidebar. */
  menu?: { label: string; onPress: () => void };
  /** The page's buttons at the right end, as 全部清除 on chrome://downloads. */
  trailing?: ReactNode;
  isNarrow: boolean;
  onSearchChange: (query: string) => void;
}) {
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  const [query, setQuery] = useState("");
  const [isNarrowSearchOpen, setIsNarrowSearchOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      onSearchChange(text);
    },
    [onSearchChange],
  );
  const clearSearch = useCallback(() => {
    inputRef.current?.replaceText("");
    handleChangeText("");
    inputRef.current?.focus();
  }, [handleChangeText]);
  const focusSearch = useCallback(() => {
    setIsNarrowSearchOpen(true);
    inputRef.current?.focus();
  }, []);
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // An empty narrow search folds back into its icon, as Chrome's does.
    if (!inputRef.current?.getText()) setIsNarrowSearchOpen(false);
  }, []);
  const isSearchCollapsed = isNarrow && !isNarrowSearchOpen;
  const isNarrowSearchShowing = isNarrow && isNarrowSearchOpen;
  const fieldStyle = useCallback(
    ({ hovered }: HoverState) => [
      styles.searchField,
      isNarrow && styles.searchFieldNarrow,
      isNarrowSearchShowing && styles.searchFieldNarrowShowing,
      hovered && !isFocused && !isNarrow && styles.searchFieldHovered,
      isFocused && !isNarrow && styles.searchFieldFocused,
    ],
    [isFocused, isNarrow, isNarrowSearchShowing],
  );

  return (
    <View style={styles.toolbar} testID="webui-toolbar">
      {isNarrowSearchShowing ? null : (
        <View style={[styles.left, isNarrow && styles.leftNarrow]}>
          {isNarrow && menu ? (
            <View style={styles.menuButton}>
              <CrIconButton
                icon="menu"
                label={menu.label}
                onPress={menu.onPress}
                testID="webui-menu"
              />
            </View>
          ) : (
            <View style={styles.logo}>
              <WebUiProductLogo />
            </View>
          )}
          <Text numberOfLines={1} style={[styles.title, isNarrow && styles.titleNarrow]}>
            {title}
          </Text>
        </View>
      )}
      <View style={[styles.center, isNarrow && styles.centerNarrow]}>
        <Pressable
          accessibilityRole={isSearchCollapsed ? "button" : "search"}
          accessibilityLabel={searchLabel}
          onPress={focusSearch}
          style={fieldStyle}
          testID="webui-search-field"
        >
          <View
            style={[styles.searchIconBox, isNarrowSearchShowing && styles.searchIconNarrowShowing]}
          >
            <ThemedWebUiIcon
              name="search"
              size={WEBUI_LAYOUT.iconSize}
              uniProps={searchIconMapping}
            />
          </View>
          {isSearchCollapsed ? null : (
            <View style={styles.searchTextArea}>
              <EditingTextInput
                ref={inputRef}
                // Chrome also autofocuses the wide field as the page loads; here a background tab
                // restored at startup would take the focus, so only an opened narrow search does.
                autoFocus={isNarrowSearchShowing}
                accessibilityLabel={searchLabel}
                initialValue={query}
                onChangeText={handleChangeText}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.searchInput}
                testID="webui-search-input"
              />
              {query || isNarrow ? null : (
                <View pointerEvents="none" style={styles.searchPrompt}>
                  <Text numberOfLines={1} style={styles.searchPromptText}>
                    {searchLabel}
                  </Text>
                </View>
              )}
            </View>
          )}
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clearSearchLabel}
              onPress={clearSearch}
              style={clearButtonStyle}
              testID="webui-search-clear"
            >
              <ThemedWebUiIcon
                name="cancelFilled"
                size={WEBUI_LAYOUT.iconSize}
                uniProps={searchIconMapping}
              />
            </Pressable>
          ) : null}
        </Pressable>
      </View>
      {isNarrow ? (
        trailing
      ) : (
        <View style={[styles.right, trailing ? styles.rightWithButtons : null]}>{trailing}</View>
      )}
    </View>
  );
}

function clearButtonStyle({ hovered }: HoverState) {
  return [styles.searchIconBox, hovered && styles.clearButtonHovered];
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    toolbar: {
      height: WEBUI_LAYOUT.toolbarHeight,
      flexDirection: "row",
      alignItems: "center",
    },
    left: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 21,
    },
    leftNarrow: {
      flexGrow: 0,
      flexBasis: "auto",
      paddingLeft: 18,
    },
    menuButton: {
      marginRight: 9,
    },
    logo: {
      marginRight: 16,
    },
    title: {
      flexShrink: 1,
      marginLeft: 6,
      paddingRight: 12,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: TITLE_SIZE,
      fontWeight: "500",
      letterSpacing: 0.25,
      color: colors.toolbarText,
    },
    titleNarrow: {
      marginLeft: 0,
    },
    center: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 680,
      flexDirection: "row",
      justifyContent: "center",
    },
    centerNarrow: {
      flexBasis: 0,
      justifyContent: "flex-end",
    },
    right: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      paddingRight: 12,
    },
    rightWithButtons: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
    },
    searchField: {
      flex: 1,
      maxWidth: SEARCH_FIELD_MAX_WIDTH,
      height: SEARCH_FIELD_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 6,
      borderRadius: 100,
      backgroundColor: colors.searchField,
    },
    searchFieldNarrow: {
      flex: 0,
      minWidth: NARROW_SEARCH_BOX_WIDTH,
      height: NARROW_SEARCH_BOX_HEIGHT,
      paddingHorizontal: 0,
      borderRadius: 0,
      backgroundColor: "transparent",
    },
    // An opened narrow search takes the whole toolbar, its icon 18 dip in.
    searchFieldNarrowShowing: {
      flex: 1,
      maxWidth: "100%",
    },
    searchIconNarrowShowing: {
      marginLeft: NARROW_SEARCH_ICON_INSET,
    },
    searchFieldHovered: {
      boxShadow: `inset 0 0 0 ${SEARCH_FIELD_HEIGHT}px ${colors.searchFieldHover}`,
    },
    searchFieldFocused: {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: colors.focusRing,
      outlineOffset: 2,
    },
    searchIconBox: {
      width: SEARCH_ICON_BOX,
      height: SEARCH_ICON_BOX,
      borderRadius: SEARCH_ICON_BOX / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    clearButtonHovered: {
      backgroundColor: colors.hover,
    },
    searchTextArea: {
      flex: 1,
      minWidth: 120,
      alignSelf: "stretch",
      justifyContent: "center",
    },
    searchInput: {
      padding: 0,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: SEARCH_TEXT_SIZE,
      fontWeight: "500",
      lineHeight: SEARCH_LINE_HEIGHT,
      color: colors.searchFieldText,
      outlineWidth: 0,
    },
    searchPrompt: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "center",
    },
    searchPromptText: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: SEARCH_TEXT_SIZE,
      fontWeight: "500",
      color: colors.searchFieldIcon,
    },
  };
});
