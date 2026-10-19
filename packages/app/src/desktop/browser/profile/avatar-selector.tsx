import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { crGridNextIndex, isCrGridArrowKey } from "@/desktop/browser/webui/cr-grid";
import { WebUiIcon } from "@/desktop/browser/webui/icons";
import { webUiColorProps } from "@/desktop/browser/webui/theme";
import { CHROME_AVATAR_IDS, type ChromeAvatarId } from "./avatar-ids";
import { chromeAvatarImage } from "./avatars";

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const checkIconMapping = webUiColorProps("avatarCheckIcon");

// cr-profile-avatar-selector: a cr-grid of round avatars, 6 to a row; the selected one has a
// 4 dip outline and a 21 dip check (plus 1 dip padding) at its top end.
const GRID_COLUMNS = 6;
const SELECTED_OUTLINE_WIDTH = 4;
const CHECK_SIZE = 21;
const CHECK_PADDING = 1;
// Each avatar is a cr-button, whose keyboard focus is a 2 dip outline 2 dip out; a focused
// selected avatar keeps its own outline, moved out by the same gap.
const FOCUS_OUTLINE_WIDTH = 2;
const FOCUS_OUTLINE_OFFSET = 2;

// The placeholder comes first, then Chrome's default avatars; null stands for the placeholder.
const AVATAR_CHOICES: readonly (ChromeAvatarId | null)[] = [null, ...CHROME_AVATAR_IDS];

function AvatarChoice({
  avatarId,
  index,
  size,
  isSelected,
  isTabStop,
  isFocusShown,
  onChoose,
  setRef,
}: {
  avatarId: ChromeAvatarId | null;
  index: number;
  size: number;
  isSelected: boolean;
  isTabStop: boolean;
  isFocusShown: boolean;
  onChoose: (avatarId: ChromeAvatarId | null) => void;
  setRef: (index: number, node: View | null) => void;
}) {
  const { t } = useTranslation();
  const label =
    avatarId === null
      ? t("workspace.browser.profile.defaultAvatar")
      : t(`workspace.browser.profile.avatars.${avatarId}`);
  const choose = useCallback(() => onChoose(avatarId), [avatarId, onChoose]);
  const handleRef = useCallback((node: View | null) => setRef(index, node), [index, setRef]);
  const sizeStyle = useMemo(() => ({ width: size, height: size, borderRadius: size / 2 }), [size]);
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          ref={handleRef}
          accessibilityRole="radio"
          accessibilityLabel={label}
          aria-checked={isSelected}
          tabIndex={isTabStop ? 0 : -1}
          onPress={choose}
          style={[
            styles.avatar,
            sizeStyle,
            isSelected && styles.selected,
            isFocusShown && (isSelected ? styles.selectedFocused : styles.focused),
          ]}
          testID={`profile-avatar-${avatarId ?? "placeholder"}`}
        >
          <Image source={chromeAvatarImage(avatarId)} style={sizeStyle} />
          <View pointerEvents="none" style={[styles.ring, sizeStyle]} />
          {isSelected ? (
            <View pointerEvents="none" style={styles.check}>
              <ThemedWebUiIcon name="check" size={CHECK_SIZE} uniProps={checkIconMapping} />
            </View>
          ) : null}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={4}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * cr-profile-avatar-selector: Chrome's placeholder and its default avatars as radios in a grid of
 * six columns. Choosing one picks it at once; the grid scrolls sideways when the page is narrower
 * than it, as its container does.
 */
export function ProfileAvatarSelector({
  selectedAvatarId,
  avatarSize,
  spacing,
  onSelect,
}: {
  selectedAvatarId: ChromeAvatarId | null;
  avatarSize: number;
  spacing: number;
  onSelect: (avatarId: ChromeAvatarId | null) => void;
}) {
  const gridRef = useRef<View>(null);
  const itemElements = useRef<(HTMLElement | null)[]>([]);
  const [focusShownIndex, setFocusShownIndex] = useState<number | null>(null);
  const selectedIndex = AVATAR_CHOICES.indexOf(selectedAvatarId);

  const setRef = useCallback((index: number, node: View | null) => {
    const element: unknown = node;
    itemElements.current[index] = element instanceof HTMLElement ? element : null;
  }, []);

  // cr-grid's keys: Pressable already chooses on Enter, but leaves Space to buttons, and the arrows
  // move focus through the grid.
  useEffect(() => {
    const grid: unknown = gridRef.current;
    if (!(grid instanceof HTMLElement)) return;
    const indexOf = (target: EventTarget | null) =>
      itemElements.current.findIndex((element) => element !== null && element === target);
    function handleKeyDown(event: KeyboardEvent) {
      const index = indexOf(event.target);
      if (index < 0) return;
      if (event.key === " ") {
        event.preventDefault();
        onSelect(AVATAR_CHOICES[index]);
        return;
      }
      if (!isCrGridArrowKey(event.key)) return;
      event.preventDefault();
      const nextIndex = crGridNextIndex({
        count: AVATAR_CHOICES.length,
        columns: GRID_COLUMNS,
        index,
        key: event.key,
      });
      itemElements.current[nextIndex]?.focus();
    }
    // Chrome outlines an avatar focused from the keyboard only, which is what :focus-visible
    // tells apart.
    function handleFocusIn(event: FocusEvent) {
      const index = indexOf(event.target);
      const isFocusVisible =
        event.target instanceof HTMLElement && event.target.matches(":focus-visible");
      setFocusShownIndex(index >= 0 && isFocusVisible ? index : null);
    }
    function handleFocusOut() {
      setFocusShownIndex(null);
    }
    grid.addEventListener("keydown", handleKeyDown);
    grid.addEventListener("focusin", handleFocusIn);
    grid.addEventListener("focusout", handleFocusOut);
    return () => {
      grid.removeEventListener("keydown", handleKeyDown);
      grid.removeEventListener("focusin", handleFocusIn);
      grid.removeEventListener("focusout", handleFocusOut);
    };
  }, [onSelect]);

  const gridStyle = useMemo(
    () => ({
      width: GRID_COLUMNS * avatarSize + (GRID_COLUMNS - 1) * spacing,
      columnGap: spacing,
      rowGap: spacing,
    }),
    [avatarSize, spacing],
  );
  return (
    <View ref={gridRef} accessibilityRole="radiogroup" style={[styles.grid, gridStyle]}>
      {AVATAR_CHOICES.map((avatarId, index) => (
        <AvatarChoice
          key={avatarId ?? "placeholder"}
          avatarId={avatarId}
          index={index}
          size={avatarSize}
          isSelected={index === selectedIndex}
          // cr-profile-avatar-selector keeps one avatar in the Tab order: the selected one.
          isTabStop={index === Math.max(selectedIndex, 0)}
          isFocusShown={focusShownIndex === index}
          onChoose={onSelect}
          setRef={setRef}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    avatar: {
      overflow: "visible",
      outlineWidth: 0,
    },
    ring: {
      position: "absolute",
      top: 0,
      left: 0,
      borderWidth: 1,
      borderColor: colors.avatarBorder,
    },
    selected: {
      outlineStyle: "solid",
      outlineWidth: SELECTED_OUTLINE_WIDTH,
      outlineColor: colors.avatarSelectedOutline,
    },
    selectedFocused: {
      outlineOffset: FOCUS_OUTLINE_OFFSET,
    },
    focused: {
      outlineStyle: "solid",
      outlineWidth: FOCUS_OUTLINE_WIDTH,
      outlineColor: colors.focusOutline,
      outlineOffset: FOCUS_OUTLINE_OFFSET,
    },
    check: {
      position: "absolute",
      top: 0,
      right: 0,
      padding: CHECK_PADDING,
      borderRadius: (CHECK_SIZE + CHECK_PADDING * 2) / 2,
      backgroundColor: colors.avatarCheck,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
  };
});
