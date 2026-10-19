import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Image,
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { getOverlayRoot, useOverlayLayer, useWebOverlayRegistration } from "@/lib/overlay-root";
import { ChromeIcon, type ChromeIconName } from "../chrome-icons";
import { CHROME_FONT_FAMILY, CHROME_LAYOUT, chromeColorProps } from "../chrome-theme";
import {
  addressDisplaySegments,
  addressSecurity,
  type AddressSecurity,
  type AddressSegment,
} from "../address-display";
import { isAddressInput, SEARCH_ENGINE_NAME } from "../address-input";
import type {
  BrowserNavigationIntent,
  BrowserRecentSite,
  BrowserStartSnapshot,
  openBrowserStartPage,
} from "../start-page";
import { PRODUCT_NAME } from "@/constants/product";

// Omnibox geometry (location_bar_view.cc, layout_constants.cc): the leading icon is a 16 dip
// glyph in a 24 dip bubble 5 dip in, and the text starts 8 dip after the bubble.
const ICON_BUBBLE_SIZE = 24;
const ICON_SIZE = 16;
const ICON_BUBBLE_INSET = 5;
const TEXT_GAP = 8;
const TRAILING_PADDING = 12;
const FOCUS_RING_WIDTH = 2;
// With the dropdown open the icon moves 7 dip right and the text 6, onto the rows' rail.
const DROPDOWN_ICON_SHIFT = 7;
const DROPDOWN_TEXT_SHIFT = 6;
// The dropdown frame reaches 6 dip past the omnibox at the sides and 5 dip above and below it.
const DROPDOWN_SIDE_OUTSET = 6;
const DROPDOWN_TOP_OUTSET = 5;
const DROPDOWN_RADIUS = 16;
const DROPDOWN_BOTTOM_PADDING = 10;
const ROW_HEIGHT = 40;
const ROW_SIDE_PADDING = 16;
const ROW_ICON_BOX = 28;
const ROW_TEXT_GAP = 12;
const ROW_SELECTED_RADIUS = 24;
const ROW_FOCUS_BAR_WIDTH = 4;
const ROW_FONT_SIZE = 14.3;
// Chrome's match/description separator (IDS_AUTOCOMPLETE_MATCH_DESCRIPTION_SEPARATOR).
const DESCRIPTION_SEPARATOR = " - ";

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const ThemedPaseoLogo = withUnistyles(PaseoLogo);
const omniboxIconMapping = chromeColorProps("omniboxText");
const dropdownIconMapping = chromeColorProps("dropdownIcon");

interface BrowserAddressBarProps {
  page: ReturnType<typeof openBrowserStartPage>;
  snapshot: BrowserStartSnapshot;
  inputRef: RefObject<EditingTextInputHandle | null>;
  isPresented: boolean;
  onNavigate: (intent: BrowserNavigationIntent | null) => void;
}

/** The chip at the start of the omnibox: the page's security, or what Enter would do. */
function LocationIcon({
  security,
  editingDraft,
  isDropdownOpen,
}: {
  security: AddressSecurity;
  editingDraft: string | null;
  isDropdownOpen: boolean;
}) {
  const { t } = useTranslation();
  let icon: ChromeIconName = "pageInfo";
  let label: string | null = null;
  let showsProductLogo = false;
  if (editingDraft !== null) {
    icon = editingDraft && isAddressInput(editingDraft) ? "page" : "search";
  } else if (security === "none") {
    icon = "search";
  } else if (security === "notSecure") {
    icon = "notSecure";
    label = t("workspace.browser.omnibox.notSecure");
  } else if (security === "file") {
    icon = "page";
    label = t("workspace.browser.omnibox.file");
  } else if (security === "internal") {
    // Chrome shows its own name here for chrome:// pages.
    showsProductLogo = true;
    label = PRODUCT_NAME;
  }
  return (
    <View
      style={[
        styles.iconBubble,
        label !== null && styles.iconBubbleWithLabel,
        isDropdownOpen && styles.iconBubbleInDropdown,
      ]}
      testID="browser-location-icon"
    >
      {showsProductLogo ? (
        <ThemedPaseoLogo size={ICON_SIZE} uniProps={omniboxIconMapping} />
      ) : (
        <ThemedChromeIcon name={icon} size={ICON_SIZE} uniProps={omniboxIconMapping} />
      )}
      {label !== null ? <Text style={styles.iconLabel}>{label}</Text> : null}
    </View>
  );
}

export function BrowserAddressBar({
  page,
  snapshot,
  inputRef,
  isPresented,
  onNavigate,
}: BrowserAddressBarProps) {
  const { t } = useTranslation();
  const listId = useId();
  const anchorRef = useRef<View | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<ViewStyle | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const isEditing = snapshot.addressFocused;
  const hasTypedText =
    isEditing && snapshot.draft.trim().length > 0 && snapshot.draft !== snapshot.url;
  const visible = isPresented && isEditing && (snapshot.suggestions.length > 0 || hasTypedText);
  const layer = useOverlayLayer("floating");
  const security = addressSecurity(snapshot.url);
  const steadySegments = useMemo(() => addressDisplaySegments(snapshot.url), [snapshot.url]);

  const submit = useCallback(
    (intent: BrowserNavigationIntent | null) => {
      if (!intent) return;
      inputRef.current?.blur();
      onNavigate(intent);
    },
    [inputRef, onNavigate],
  );
  const submitDraft = useCallback(() => submit(page.submitDraft()), [page, submit]);
  const chooseSuggestion = useCallback(
    (index: number) => submit(page.submitSuggestion(index)),
    [page, submit],
  );
  const focusAddress = useCallback(() => {
    page.focusAddress();
    const input = inputRef.current?.getNativeRef();
    if (input instanceof HTMLInputElement) input.select();
  }, [inputRef, page]);

  const blurAddress = useCallback<NonNullable<TextInputProps["onBlur"]>>(
    (event) => {
      const nextTarget = (
        event.nativeEvent as typeof event.nativeEvent & { relatedTarget?: EventTarget | null }
      ).relatedTarget;
      if (nextTarget instanceof Node && popupRef.current?.contains(nextTarget)) return;
      page.blurAddress();
    },
    [page],
  );

  useLayoutEffect(() => {
    if (inputRef.current?.getText() !== snapshot.draft) {
      inputRef.current?.replaceText(snapshot.draft);
    }
  }, [inputRef, snapshot.draft]);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.isComposing) return false;
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        snapshot.suggestions.length > 0
      ) {
        page.moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
        return true;
      }
      if (event.key === "Enter" && snapshot.selectedSuggestionIndex >= 0) {
        submitDraft();
        return true;
      }
      if (event.key === "Escape") {
        page.cancelAddressEditing();
        inputRef.current?.blur();
        return true;
      }
      return false;
    },
    [inputRef, page, snapshot.selectedSuggestionIndex, snapshot.suggestions.length, submitDraft],
  );
  const setOverlayScope = useWebOverlayRegistration({
    active: visible,
    layer,
    manageFocus: false,
    onKeyDown: handleKey,
  });

  useLayoutEffect(() => {
    const input = inputRef.current?.getNativeRef();
    if (!(input instanceof HTMLInputElement)) return;
    const keyDown = (event: KeyboardEvent) => {
      if (!handleKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    input.addEventListener("keydown", keyDown);
    return () => input.removeEventListener("keydown", keyDown);
  }, [handleKey, inputRef]);

  useLayoutEffect(() => {
    if (!visible) {
      setFrame(null);
      return;
    }
    const anchor = anchorRef.current as unknown as HTMLElement | null;
    if (!anchor) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setFrame(null);
        return;
      }
      setFrame({
        position: "absolute",
        left: rect.left - DROPDOWN_SIDE_OUTSET,
        top: rect.top - DROPDOWN_TOP_OUTSET,
        width: rect.width + 2 * DROPDOWN_SIDE_OUTSET,
        maxHeight: Math.max(0, window.innerHeight - rect.top),
        zIndex: layer,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [layer, visible]);

  const comboboxProps = useMemo(
    () =>
      comboboxAttributes({
        listId,
        isDropdownOpen: visible,
        selectedIndex: snapshot.selectedSuggestionIndex,
      }),
    [listId, snapshot.selectedSuggestionIndex, visible],
  );
  const showsSteadyAddress = !isEditing && steadySegments.length > 0;
  const showsPlaceholder = !isEditing && snapshot.draft.length === 0;
  return (
    <View
      ref={anchorRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={omniboxStyle({ isHovered, isEditing, isDropdownOpen: visible })}
      testID="browser-address-bar"
    >
      <LocationIcon
        security={security}
        editingDraft={hasTypedText ? snapshot.draft : null}
        isDropdownOpen={visible}
      />
      <View style={[styles.textArea, visible && styles.textAreaInDropdown]}>
        <EditingTextInput
          ref={inputRef}
          accessibilityLabel={t("workspace.browser.controls.browserUrl")}
          autoCapitalize="none"
          autoCorrect={false}
          initialValue={snapshot.draft}
          onChangeText={page.editDraft}
          onFocus={focusAddress}
          onBlur={blurAddress}
          onSubmitEditing={submitDraft}
          style={[styles.input, showsSteadyAddress && styles.inputUnderSteadyAddress]}
          {...comboboxProps}
        />
        {showsSteadyAddress ? <SteadyAddress segments={steadySegments} /> : null}
        {showsPlaceholder ? (
          <View pointerEvents="none" style={styles.overlayText} aria-hidden>
            <Text numberOfLines={1} style={styles.placeholder}>
              {t("workspace.browser.omnibox.placeholder", { engine: SEARCH_ENGINE_NAME })}
            </Text>
          </View>
        ) : null}
      </View>
      {visible && frame
        ? createPortal(
            <div ref={popupRef} id={listId} role="listbox" onMouseDown={preserveInputFocus}>
              <View
                ref={setOverlayScope}
                style={[styles.dropdownFrame, frame]}
                pointerEvents="box-none"
                testID="browser-address-suggestions"
              >
                {/* The omnibox shows through the frame's top; only the rows below it are drawn. */}
                <View pointerEvents="none" style={styles.dropdownInputRow} />
                <AddressSuggestionRows
                  listId={listId}
                  snapshot={snapshot}
                  showsTypedText={hasTypedText}
                  onSubmitDraft={submitDraft}
                  onChooseSuggestion={chooseSuggestion}
                />
              </View>
            </div>,
            getOverlayRoot(),
          )
        : null}
    </View>
  );
}

/** The omnibox fill: resting, hovered, or focused with a ring unless the dropdown is open. */
function omniboxStyle(state: { isHovered: boolean; isEditing: boolean; isDropdownOpen: boolean }) {
  return [
    styles.omnibox,
    state.isHovered && !state.isEditing && styles.omniboxHovered,
    state.isEditing && styles.omniboxFocused,
    state.isEditing && !state.isDropdownOpen && styles.omniboxFocusRing,
  ];
}

/** The input's combobox attributes, pointing at the dropdown row the arrows selected. */
function comboboxAttributes(input: {
  listId: string;
  isDropdownOpen: boolean;
  selectedIndex: number;
}) {
  return {
    "aria-autocomplete": "list",
    "aria-controls": input.isDropdownOpen ? input.listId : undefined,
    "aria-expanded": input.isDropdownOpen,
    "aria-activedescendant":
      input.selectedIndex >= 0 ? `${input.listId}-${input.selectedIndex}` : undefined,
    role: "combobox" as const,
  };
}

/** The address at rest: the host at full strength, the rest dimmed. */
function SteadyAddress({ segments }: { segments: readonly AddressSegment[] }) {
  return (
    <View pointerEvents="none" style={styles.overlayText} aria-hidden>
      <Text numberOfLines={1} style={styles.steadyAddress}>
        {segments.map((segment) => (
          <Text key={segment.part} style={segment.isHost ? styles.steadyHost : null}>
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** The dropdown's rows: what was typed first, then matching pages from history. */
function AddressSuggestionRows({
  listId,
  snapshot,
  showsTypedText,
  onSubmitDraft,
  onChooseSuggestion,
}: {
  listId: string;
  snapshot: BrowserStartSnapshot;
  showsTypedText: boolean;
  onSubmitDraft: () => void;
  onChooseSuggestion: (index: number) => void;
}) {
  return (
    <View style={styles.dropdownRows}>
      {showsTypedText ? (
        <TypedTextRow
          draft={snapshot.draft}
          isSelected={snapshot.selectedSuggestionIndex < 0}
          onChoose={onSubmitDraft}
        />
      ) : null}
      {snapshot.suggestions.map((site, index) => (
        <AddressSuggestion
          key={site.url}
          id={`${listId}-${index}`}
          site={site}
          index={index}
          selected={snapshot.selectedSuggestionIndex === index}
          onChoose={onChooseSuggestion}
        />
      ))}
    </View>
  );
}

function preserveInputFocus(event: { preventDefault(): void }) {
  event.preventDefault();
}

function suggestionRowStyle(isSelected: boolean) {
  return ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
    styles.row,
    hovered && !isSelected && styles.rowHovered,
    isSelected && styles.rowSelected,
  ];
}

/** Chrome's first row: what was typed, as a search or as the address it names. */
function TypedTextRow({
  draft,
  isSelected,
  onChoose,
}: {
  draft: string;
  isSelected: boolean;
  onChoose: () => void;
}) {
  const { t } = useTranslation();
  const isAddress = isAddressInput(draft);
  return (
    <Pressable
      role="option"
      accessible
      accessibilityLabel={draft}
      tabIndex={-1}
      aria-selected={isSelected}
      onPress={onChoose}
      style={suggestionRowStyle(isSelected)}
      testID="browser-address-typed-row"
    >
      {isSelected ? <View style={styles.focusBar} /> : null}
      <View style={styles.rowIconBox}>
        <ThemedChromeIcon
          name={isAddress ? "page" : "search"}
          size={ICON_SIZE}
          uniProps={dropdownIconMapping}
        />
      </View>
      <Text numberOfLines={1} style={styles.rowText}>
        <Text style={isAddress ? styles.rowUrl : styles.rowPrimary}>{draft}</Text>
        {isAddress ? null : (
          <Text style={styles.rowSecondary}>
            {DESCRIPTION_SEPARATOR}
            {t("workspace.browser.omnibox.searchDescription", { engine: SEARCH_ENGINE_NAME })}
          </Text>
        )}
      </Text>
    </Pressable>
  );
}

function AddressSuggestion({
  id,
  site,
  index,
  selected,
  onChoose,
}: {
  id: string;
  site: BrowserRecentSite;
  index: number;
  selected: boolean;
  onChoose: (index: number) => void;
}) {
  const source = useMemo(
    () => (site.faviconUrl ? { uri: site.faviconUrl } : undefined),
    [site.faviconUrl],
  );
  const choose = useCallback(() => onChoose(index), [index, onChoose]);
  const displayedUrl = addressDisplaySegments(site.url)
    .map((segment) => segment.text)
    .join("");
  const title = site.title.trim();
  return (
    <Pressable
      nativeID={id}
      role="option"
      accessible
      accessibilityLabel={title || displayedUrl}
      tabIndex={-1}
      aria-selected={selected}
      onPress={choose}
      style={suggestionRowStyle(selected)}
    >
      {selected ? <View style={styles.focusBar} /> : null}
      <View style={styles.rowIconBox}>
        {source ? (
          <Image source={source} style={styles.favicon} />
        ) : (
          <ThemedChromeIcon name="page" size={ICON_SIZE} uniProps={dropdownIconMapping} />
        )}
      </View>
      <Text numberOfLines={1} style={styles.rowText}>
        {title ? (
          <>
            <Text style={styles.rowPrimary}>{title}</Text>
            <Text style={styles.rowSecondary}>{DESCRIPTION_SEPARATOR}</Text>
          </>
        ) : null}
        <Text style={styles.rowUrl}>{displayedUrl}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    // The toolbar slot gives the width; a flex basis here would override the 34 dip height.
    omnibox: {
      minWidth: 0,
      height: CHROME_LAYOUT.locationBarHeight,
      flexDirection: "row",
      alignItems: "center",
      gap: TEXT_GAP,
      paddingLeft: ICON_BUBBLE_INSET,
      paddingRight: TRAILING_PADDING,
      borderRadius: CHROME_LAYOUT.locationBarHeight / 2,
      backgroundColor: chrome.omnibox,
    },
    omniboxHovered: {
      backgroundColor: chrome.omniboxHovered,
    },
    omniboxFocused: {
      backgroundColor: chrome.omniboxFocused,
    },
    omniboxFocusRing: {
      boxShadow: `inset 0 0 0 ${FOCUS_RING_WIDTH}px ${chrome.focusRing}`,
    },
    iconBubble: {
      minWidth: ICON_BUBBLE_SIZE,
      height: ICON_BUBBLE_SIZE,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderRadius: ICON_BUBBLE_SIZE / 2,
      backgroundColor: chrome.omniboxIconChip,
      flexShrink: 0,
    },
    iconBubbleWithLabel: {
      paddingLeft: 4,
      paddingRight: 8,
    },
    iconBubbleInDropdown: {
      backgroundColor: "transparent",
      marginLeft: DROPDOWN_ICON_SHIFT,
    },
    iconLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      color: chrome.omniboxText,
    },
    textArea: {
      flex: 1,
      minWidth: 0,
      alignSelf: "stretch",
      justifyContent: "center",
    },
    textAreaInDropdown: {
      marginLeft: DROPDOWN_TEXT_SHIFT - DROPDOWN_ICON_SHIFT,
    },
    input: {
      flex: 1,
      minWidth: 0,
      padding: 0,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      color: chrome.omniboxText,
      outlineWidth: 0,
    },
    // At rest the formatted address is drawn over the input, which keeps focus behaviour.
    inputUnderSteadyAddress: {
      color: "transparent",
    },
    overlayText: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: "center",
    },
    steadyAddress: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      color: chrome.omniboxTextDimmed,
    },
    steadyHost: {
      color: chrome.omniboxText,
    },
    placeholder: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 14,
      color: chrome.omniboxText,
    },
    dropdownFrame: {
      borderRadius: DROPDOWN_RADIUS,
      backgroundColor: "transparent",
      boxShadow: `0 0 12px rgba(${chrome.dropdownShadowRgb},0.08), 0 12px 16px rgba(${chrome.dropdownShadowRgb},0.18)`,
    },
    dropdownInputRow: {
      height: CHROME_LAYOUT.locationBarHeight + 2 * DROPDOWN_TOP_OUTSET,
    },
    dropdownRows: {
      pointerEvents: "auto",
      paddingBottom: DROPDOWN_BOTTOM_PADDING,
      backgroundColor: chrome.dropdown,
      borderBottomLeftRadius: DROPDOWN_RADIUS,
      borderBottomRightRadius: DROPDOWN_RADIUS,
      overflow: "hidden",
    },
    row: {
      position: "relative",
      height: ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: ROW_TEXT_GAP,
      marginRight: ROW_SIDE_PADDING,
      paddingLeft: ROW_SIDE_PADDING,
      paddingRight: ROW_SIDE_PADDING / 2,
      borderTopRightRadius: ROW_SELECTED_RADIUS,
      borderBottomRightRadius: ROW_SELECTED_RADIUS,
    },
    rowHovered: {
      backgroundColor: chrome.dropdownRowHovered,
    },
    rowSelected: {
      backgroundColor: chrome.dropdownRowSelected,
    },
    focusBar: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: ROW_FOCUS_BAR_WIDTH,
      borderTopRightRadius: ROW_FOCUS_BAR_WIDTH,
      borderBottomRightRadius: ROW_FOCUS_BAR_WIDTH,
      backgroundColor: chrome.dropdownFocusBar,
    },
    rowIconBox: {
      width: ROW_ICON_BOX,
      height: ROW_ICON_BOX,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    favicon: {
      width: ICON_SIZE,
      height: ICON_SIZE,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: ROW_FONT_SIZE,
      color: chrome.dropdownText,
    },
    rowPrimary: {
      color: chrome.dropdownText,
    },
    rowSecondary: {
      color: chrome.dropdownTextDimmed,
    },
    rowUrl: {
      color: chrome.dropdownUrl,
    },
  };
});
