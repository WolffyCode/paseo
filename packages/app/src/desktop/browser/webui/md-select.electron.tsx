import { createElement, useCallback, useState, type ChangeEvent } from "react";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";

// .md-select: 200 x 36, 1 dip border, radius 8, 10 dip in from the left and 20 from the right,
// where arrow_down.svg sits 10 dip in at 7 x 3.5.
const SELECT_WIDTH = 200;
const SELECT_HEIGHT = 36;
const SELECT_TEXT_SIZE = 12;
const ARROW_WIDTH = 7;
const ARROW_HEIGHT = 3.5;
const ARROW_INSET = 10;

function ArrowDown({ color }: { color: string }) {
  return (
    <Svg width={ARROW_WIDTH} height={ARROW_HEIGHT} viewBox="0 0 24 12">
      <Path d="M0 0h24L12 12z" fill={color} />
    </Svg>
  );
}

const ThemedArrowDown = withUnistyles(ArrowDown, (theme) => ({ color: theme.webui.icon }));

// The native control covers the drawn one, invisible, so the system menu opens on a click as
// Chrome's <select> does.
const NATIVE_SELECT_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "pointer",
  font: "inherit",
} as const;

/**
 * md-select, settings' dropdown: Chrome draws a plain <select>, so its list is the system menu.
 * Options are value / label pairs.
 */
export function MdSelect<Value extends string>({
  value,
  options,
  accessibilityLabel,
  onChange,
  testID,
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  accessibilityLabel: string;
  onChange: (value: Value) => void;
  testID?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const chosen = options.find((option) => option.value === event.target.value);
      if (chosen) onChange(chosen.value);
    },
    [onChange, options],
  );
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  return (
    <View
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={[styles.select, isHovered && styles.selectHovered, isFocused && styles.selectFocused]}
    >
      <Text numberOfLines={1} style={styles.label}>
        {selectedLabel}
      </Text>
      <View style={styles.arrow}>
        <ThemedArrowDown />
      </View>
      {createElement(
        "select",
        {
          "aria-label": accessibilityLabel,
          "data-testid": testID,
          value,
          onChange: handleChange,
          onFocus: handleFocus,
          onBlur: handleBlur,
          style: NATIVE_SELECT_STYLE,
        },
        options.map((option) =>
          createElement("option", { key: option.value, value: option.value }, option.label),
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    select: {
      width: SELECT_WIDTH,
      height: SELECT_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 10,
      paddingRight: 20,
      borderWidth: 1,
      borderColor: colors.selectBorder,
      borderRadius: 8,
    },
    selectHovered: {
      backgroundColor: colors.hoverOnSubtle,
    },
    selectFocused: {
      outlineWidth: 2,
      outlineStyle: "solid",
      outlineColor: colors.primary,
      outlineOffset: -1,
    },
    label: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: SELECT_TEXT_SIZE,
      color: colors.text,
    },
    arrow: {
      position: "absolute",
      right: ARROW_INSET,
      top: (SELECT_HEIGHT - 2 - ARROW_HEIGHT) / 2,
    },
  };
});
