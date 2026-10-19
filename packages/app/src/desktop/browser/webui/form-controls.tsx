import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { WebUiIcon, type WebUiIconName } from "./icons";
import { CrHighlightedText } from "./search-highlight";
import { WEBUI_LAYOUT, webUiColorProps, type WebUiColors } from "./theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

// cr-radio-button: a 16 dip ring with a 2 dip border, a dot half its size when checked, a 32 dip
// hover circle around it, and 20 dip before the label.
const DISC_SIZE = 16;
const DISC_BORDER = 2;
const HOVER_CIRCLE = 32;
const LABEL_GAP = 20;
// A radio whose content is taller than one line keeps its ring by the first line.
const TOP_ALIGNED_DISC_OFFSET = 8;

/**
 * cr-radio-button: a ring and its label, or other content such as an address field. Pressing
 * anywhere on it checks it. `label-first` puts the content first and the ring at the end.
 */
export function CrRadioButton({
  label,
  isChecked,
  onCheck,
  isTopAligned = false,
  isLabelFirst = false,
  size = DISC_SIZE,
  testID,
  children,
}: {
  label?: string;
  isChecked: boolean;
  onCheck: () => void;
  /** For content taller than a line: the ring stays by its first line. */
  isTopAligned?: boolean;
  isLabelFirst?: boolean;
  /** --cr-radio-button-size; the dot stays half of it. */
  size?: number;
  testID?: string;
  children?: ReactNode;
}) {
  const sizeStyles = useMemo(
    () => ({
      wrapper: { width: size, height: size },
      disc: { width: size, height: size, borderRadius: size / 2 },
      dot: { width: size / 2, height: size / 2, borderRadius: size / 4 },
      hover: { top: (size - HOVER_CIRCLE) / 2, left: (size - HOVER_CIRCLE) / 2 },
    }),
    [size],
  );
  const radioStyle = useCallback(
    () => [styles.radio, isTopAligned && styles.radioTopAligned],
    [isTopAligned],
  );
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={isChecked}
      accessibilityLabel={label}
      onPress={onCheck}
      style={radioStyle}
      testID={testID}
    >
      {({ hovered }: HoverState) => {
        const disc = (
          <View
            style={[styles.discWrapper, sizeStyles.wrapper, isTopAligned && styles.discTopAligned]}
          >
            {hovered ? (
              <View pointerEvents="none" style={[styles.discHover, sizeStyles.hover]} />
            ) : null}
            <View
              style={[
                styles.disc,
                sizeStyles.disc,
                isChecked ? styles.discChecked : styles.discUnchecked,
              ]}
            >
              {isChecked ? <View style={[styles.dot, sizeStyles.dot]} /> : null}
            </View>
          </View>
        );
        const content = (
          <>
            {label ? <CrHighlightedText text={label} style={styles.radioLabel} /> : null}
            {children}
          </>
        );
        return isLabelFirst ? (
          <>
            <View style={styles.radioContentFirst}>{content}</View>
            {disc}
          </>
        ) : (
          <>
            {disc}
            {content}
          </>
        );
      }}
    </Pressable>
  );
}

// cr-input: a 36 dip filled field, rounded only at the top, over a 1 dip line that a 2 dip line
// in the checked color covers while focused. A field with an error message keeps 11 dip of room
// for it 4 dip under the line while hidden, so showing an error barely moves the rows below.
const INPUT_HEIGHT = 36;
const INPUT_RADIUS = 8;
const INPUT_PADDING = 10;
const INPUT_TEXT_SIZE = 12;
const INPUT_LINE_HEIGHT = 16;
const ERROR_TEXT_SIZE = 11;
const ERROR_MIN_HEIGHT = 11;

const ThemedEditingTextInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.webui.textSecondary,
}));
// cr-input's caret takes the error color while the text is invalid.
const caretMappings = {
  valid: (theme: { webui: WebUiColors }) => ({ selectionColor: theme.webui.primary }),
  invalid: (theme: { webui: WebUiColors }) => ({ selectionColor: theme.webui.inputError }),
} as const;

/**
 * cr-input as settings' text prefs use it (home-url-input, the profile name). `value` is the
 * saved text: it replaces what the field shows whenever it changes, or `resetKey` does. Each edit
 * goes to `onChangeText`; leaving the field hands the text to `onCommit`, and so does Enter unless
 * the text is invalid. Esc puts the saved text back and leaves the field (`onRevert`). An invalid
 * field draws its line in the error color, with `errorText` under it when there is one.
 */
export function CrInput({
  value,
  resetKey,
  placeholder,
  accessibilityLabel,
  isInvalid,
  errorText,
  width,
  maxLength,
  isTabbable = true,
  onFocus,
  onChangeText,
  onCommit,
  onRevert,
  testID,
}: {
  value: string;
  resetKey?: number;
  placeholder?: string;
  accessibilityLabel: string;
  isInvalid: boolean;
  /** cr-input's error-message; without one there is no error line (--cr-input-error-display). */
  errorText?: string;
  width: number | `${number}%`;
  maxLength?: number;
  /** home-url-input's canTab: false leaves it out of the Tab order while its radio is off. */
  isTabbable?: boolean;
  onFocus?: () => void;
  onChangeText?: (text: string) => void;
  onCommit: (text: string) => void;
  onRevert?: () => void;
  testID?: string;
}) {
  const inputRef = useRef<EditingTextInputHandle | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // setInputValueFromPref_: a newly saved value, or a reset, replaces whatever the field shows.
  useEffect(() => {
    inputRef.current?.replaceText(value);
  }, [value, resetKey]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onCommit(inputRef.current?.getText() ?? "");
  }, [onCommit]);
  const handleSubmit = useCallback(() => {
    if (isInvalid) return;
    onCommit(inputRef.current?.getText() ?? "");
  }, [isInvalid, onCommit]);
  const handleKeyPress = useCallback(
    (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key !== "Escape") return;
      inputRef.current?.replaceText(value);
      onRevert?.();
      inputRef.current?.blur();
    },
    [onRevert, value],
  );
  const fieldStyle = useCallback(
    ({ hovered }: HoverState) => [styles.field, { width }, hovered && styles.fieldHovered],
    [width],
  );
  return (
    <View>
      <Pressable accessible={false} style={fieldStyle}>
        <ThemedEditingTextInput
          ref={inputRef}
          initialValue={value}
          placeholder={placeholder}
          accessibilityLabel={accessibilityLabel}
          aria-invalid={isInvalid}
          maxLength={maxLength}
          spellCheck={false}
          tabIndex={isTabbable ? 0 : -1}
          blurOnSubmit={false}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSubmitEditing={handleSubmit}
          onKeyPress={handleKeyPress}
          uniProps={isInvalid ? caretMappings.invalid : caretMappings.valid}
          style={styles.input}
          testID={testID}
        />
        <View
          pointerEvents="none"
          style={[
            styles.underline,
            isFocused && styles.underlineFocused,
            isInvalid && styles.underlineInvalid,
          ]}
        />
      </Pressable>
      {errorText === undefined ? null : (
        <Text role={isInvalid ? "alert" : undefined} style={styles.error}>
          {isInvalid ? errorText : ""}
        </Text>
      )}
    </View>
  );
}

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const checkMarkMappings = {
  enabled: webUiColorProps("onPrimary"),
  disabled: webUiColorProps("disabledForeground"),
} as const;
const chipIconMappings = {
  selected: webUiColorProps("onTonalContainer"),
  unselected: webUiColorProps("primary"),
} as const;

// cr-checkbox: a 16 dip box with a 2 dip border and radius 2, its 12 dip mark 2 dip in, a 32 dip
// hover circle, and the labels 20 dip after it. settings-checkbox puts it 8 dip below the row's
// top and 4 above its bottom.
const CHECKBOX_SIZE = 16;
const CHECKBOX_BORDER = 2;
const CHECK_MARK_SIZE = 12;
const CHECKBOX_LABEL_GAP = 20;
const CHECKBOX_ROW_MIN_HEIGHT = 40;

/**
 * settings-checkbox with a sublabel, as 删除浏览数据 lists its data types: the whole row ticks
 * the box. While disabled it keeps its labels and greys its box.
 */
export function CrCheckbox({
  label,
  subLabel,
  isChecked,
  isDisabled = false,
  onChange,
  testID,
}: {
  label: string;
  subLabel: string | null;
  isChecked: boolean;
  isDisabled?: boolean;
  onChange: (isChecked: boolean) => void;
  testID?: string;
}) {
  const toggle = useCallback(() => onChange(!isChecked), [isChecked, onChange]);
  let boxStyle;
  if (isDisabled) {
    boxStyle = isChecked ? styles.checkboxCheckedDisabled : styles.checkboxUncheckedDisabled;
  } else {
    boxStyle = isChecked ? styles.checkboxChecked : styles.checkboxUnchecked;
  }
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={isChecked}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={toggle}
      style={styles.checkboxRow}
      testID={testID}
    >
      {({ hovered }: HoverState) => (
        <>
          <View style={styles.checkboxBoxWrapper}>
            {hovered && !isDisabled ? (
              <View pointerEvents="none" style={styles.checkboxHover} />
            ) : null}
            <View style={[styles.checkboxBox, boxStyle]}>
              {isChecked ? (
                <ThemedWebUiIcon
                  name="checkboxMark"
                  size={CHECK_MARK_SIZE}
                  uniProps={isDisabled ? checkMarkMappings.disabled : checkMarkMappings.enabled}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.checkboxLabels}>
            <Text style={styles.checkboxTitle}>{label}</Text>
            {subLabel ? <Text style={styles.checkboxSubLabel}>{subLabel}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

// cr-chip: 28 tall, 8 dip in, radius 8, its 16 dip icons 4 dip from the label.
const CHIP_HEIGHT = 28;
const CHIP_ICON_SIZE = 16;

/**
 * cr-chip: a small outlined choice; selected, it fills and leads with a check. `trailingIcon`
 * follows the label, as the 更多 chip's arrow.
 */
export const CrChip = forwardRef<
  View,
  {
    label: string;
    isSelected: boolean;
    trailingIcon?: WebUiIconName;
    onPress: () => void;
    testID?: string;
  }
>(function CrChip({ label, isSelected, trailingIcon, onPress, testID }, ref) {
  const iconMapping = isSelected ? chipIconMappings.selected : chipIconMappings.unselected;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      aria-pressed={isSelected}
      onPress={onPress}
      style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
      testID={testID}
    >
      {({ hovered }: HoverState) => (
        <>
          {hovered ? <View pointerEvents="none" style={styles.chipHover} /> : null}
          {isSelected ? (
            <ThemedWebUiIcon name="check" size={CHIP_ICON_SIZE} uniProps={iconMapping} />
          ) : null}
          <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>{label}</Text>
          {trailingIcon ? (
            <ThemedWebUiIcon name={trailingIcon} size={CHIP_ICON_SIZE} uniProps={iconMapping} />
          ) : null}
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    radio: {
      flexDirection: "row",
      alignItems: "center",
      gap: LABEL_GAP,
      minHeight: WEBUI_LAYOUT.rowMinHeight,
    },
    radioTopAligned: {
      alignItems: "flex-start",
    },
    discWrapper: {
      alignItems: "center",
      justifyContent: "center",
    },
    radioContentFirst: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    discTopAligned: {
      marginTop: TOP_ALIGNED_DISC_OFFSET,
    },
    discHover: {
      position: "absolute",
      width: HOVER_CIRCLE,
      height: HOVER_CIRCLE,
      borderRadius: HOVER_CIRCLE / 2,
      backgroundColor: colors.hover,
    },
    disc: {
      borderWidth: DISC_BORDER,
      alignItems: "center",
      justifyContent: "center",
    },
    discUnchecked: {
      borderColor: colors.outline,
    },
    discChecked: {
      borderColor: colors.primary,
    },
    dot: {
      backgroundColor: colors.primary,
    },
    radioLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.text,
    },
    field: {
      height: INPUT_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: INPUT_PADDING,
      borderTopLeftRadius: INPUT_RADIUS,
      borderTopRightRadius: INPUT_RADIUS,
      overflow: "hidden",
      backgroundColor: colors.inputFill,
    },
    fieldHovered: {
      boxShadow: `inset 0 0 0 ${INPUT_HEIGHT}px ${colors.hover}`,
    },
    input: {
      padding: 0,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: INPUT_TEXT_SIZE,
      lineHeight: INPUT_LINE_HEIGHT,
      color: colors.text,
      outlineWidth: 0,
    },
    underline: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: colors.inputUnderline,
    },
    underlineFocused: {
      height: 2,
      backgroundColor: colors.primary,
    },
    underlineInvalid: {
      height: 2,
      backgroundColor: colors.inputError,
    },
    checkboxRow: {
      minHeight: CHECKBOX_ROW_MIN_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    checkboxBoxWrapper: {
      width: CHECKBOX_SIZE,
      height: CHECKBOX_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxHover: {
      position: "absolute",
      top: (CHECKBOX_SIZE - HOVER_CIRCLE) / 2,
      left: (CHECKBOX_SIZE - HOVER_CIRCLE) / 2,
      width: HOVER_CIRCLE,
      height: HOVER_CIRCLE,
      borderRadius: HOVER_CIRCLE / 2,
      backgroundColor: colors.hover,
    },
    checkboxBox: {
      width: CHECKBOX_SIZE,
      height: CHECKBOX_SIZE,
      borderWidth: CHECKBOX_BORDER,
      borderRadius: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxUnchecked: {
      borderColor: colors.outline,
    },
    checkboxChecked: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    checkboxUncheckedDisabled: {
      borderColor: colors.disabledBackground,
    },
    checkboxCheckedDisabled: {
      borderColor: "transparent",
      backgroundColor: colors.disabledBackground,
    },
    checkboxLabels: {
      flex: 1,
      paddingLeft: CHECKBOX_LABEL_GAP,
    },
    checkboxTitle: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      fontWeight: "500",
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.text,
    },
    checkboxSubLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.textSecondary,
    },
    chip: {
      height: CHIP_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderRadius: 8,
      overflow: "hidden",
    },
    chipUnselected: {
      borderColor: colors.buttonBorder,
    },
    chipSelected: {
      borderColor: colors.tonalContainer,
      backgroundColor: colors.tonalContainer,
    },
    chipHover: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.hoverOnSubtle,
    },
    chipLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 12,
      fontWeight: "500",
      color: colors.text,
    },
    chipLabelSelected: {
      color: colors.onTonalContainer,
    },
    error: {
      minHeight: ERROR_MIN_HEIGHT,
      marginVertical: 4,
      marginHorizontal: INPUT_PADDING,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: ERROR_TEXT_SIZE,
      lineHeight: INPUT_LINE_HEIGHT,
      color: colors.inputError,
    },
  };
});
