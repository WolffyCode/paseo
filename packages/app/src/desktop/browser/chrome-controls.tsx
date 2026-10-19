import { forwardRef, useCallback, useMemo, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CHROME_FONT_FAMILY, CHROME_LAYOUT, chromeColorProps } from "./chrome-theme";

/** MouseEvent.button of the primary (usually left) button. */
export const PRIMARY_MOUSE_BUTTON = 0;
/** MouseEvent.button of the middle (wheel) button. */
export const MIDDLE_MOUSE_BUTTON = 1;

/**
 * A round toolbar button: 34 dip, filled on hover and press like Chrome's ink drop. `label` is
 * its accessible name; the tooltip shows `tooltip`, or the name when Chrome has no separate one.
 */
export const ChromeToolbarButton = forwardRef<
  View,
  {
    label: string;
    tooltip?: string;
    onPress: (event: GestureResponderEvent) => void;
    /** Pressing and holding, as for Chrome's back and forward history menus. */
    onLongPress?: () => void;
    onContextMenu?: (event: MouseEvent) => void;
    /** Chrome runs some buttons' commands on a middle click too, into a new tab. */
    onMiddleClick?: (event: MouseEvent) => void;
    isDisabled?: boolean;
    isActive?: boolean;
    testID?: string;
    children: ReactNode;
  }
>(function ChromeToolbarButton(
  {
    label,
    tooltip,
    onPress,
    onLongPress,
    onContextMenu,
    onMiddleClick,
    isDisabled = false,
    isActive = false,
    testID,
    children,
  },
  ref,
) {
  const handleAuxClick = useCallback(
    (event: MouseEvent) => {
      if (event.button !== MIDDLE_MOUSE_BUTTON || !onMiddleClick || isDisabled) {
        return;
      }
      event.preventDefault();
      onMiddleClick(event);
    },
    [isDisabled, onMiddleClick],
  );
  // react-native-web forwards these DOM handlers; RN's types don't list them.
  const domHandlers = useMemo(
    () => ({ onContextMenu, onAuxClick: onMiddleClick ? handleAuxClick : undefined }),
    [handleAuxClick, onContextMenu, onMiddleClick],
  );
  // An active button (its menu, bubble or side panel is open) keeps Chrome's ACTIVATED ink drop,
  // which looks like the pressed one.
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.toolbarButton,
      hovered && styles.toolbarButtonHovered,
      (pressed || isActive) && styles.toolbarButtonPressed,
    ],
    [isActive],
  );
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild disabled={isDisabled}>
        <Pressable
          ref={ref}
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={isDisabled}
          onPress={onPress}
          onLongPress={onLongPress}
          {...domHandlers}
          testID={testID}
          style={buttonStyle}
        >
          {children}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.tooltipText}>{tooltip ?? label}</Text>
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * The 2 × 16 bar Chrome draws after the extensions and after the pinned buttons (toolbar_divider.cc),
 * 9 dip from its neighbours.
 */
export function ChromeToolbarDivider() {
  return <View style={styles.toolbarDivider} />;
}

/** Chrome's dialog buttons: the prominent (filled) one accepts, the tonal one declines. */
export function ChromeDialogButton({
  label,
  variant,
  onPress,
  isDisabled = false,
  testID,
}: {
  label: string;
  variant: "prominent" | "tonal";
  onPress: (event: GestureResponderEvent) => void;
  isDisabled?: boolean;
  testID?: string;
}) {
  const isProminent = variant === "prominent";
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.dialogButton,
      isProminent ? styles.dialogButtonProminent : styles.dialogButtonTonal,
      hovered && !isDisabled && styles.dialogButtonHovered,
      pressed && !isDisabled && styles.dialogButtonPressed,
      isDisabled && styles.dialogButtonDisabled,
    ],
    [isDisabled, isProminent],
  );
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={buttonStyle}
    >
      <Text
        style={[
          styles.dialogButtonLabel,
          isProminent ? styles.dialogButtonLabelProminent : styles.dialogButtonLabelTonal,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// cr-checkbox's check mark (ui/webui/resources/cr_elements/cr_checkbox/cr_checkbox.html.ts).
const CHECK_MARK_PATH =
  "m10.192 2.121-6.01 6.01-2.121-2.12L1 7.07l2.121 2.121.707.707.354.354 7.071-7.071-1.06-1.06Z";
const CHECK_MARK_SIZE = 12;

/** Chrome's WebUI checkbox (cr-checkbox): a 16 dip box, the label 20 dip after it. */
export function ChromeCheckbox({
  label,
  isChecked,
  onChange,
  isDisabled = false,
  testID,
}: {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  isDisabled?: boolean;
  testID?: string;
}) {
  const handlePress = useCallback(() => {
    onChange(!isChecked);
  }, [isChecked, onChange]);
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={isChecked}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      onPress={handlePress}
      style={[styles.checkboxRow, isDisabled && styles.checkboxRowDisabled]}
      testID={testID}
    >
      <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
        {isChecked ? <ThemedCheckMark uniProps={checkMarkMapping} /> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckMark({ color }: { color: string }) {
  return (
    <Svg width={CHECK_MARK_SIZE} height={CHECK_MARK_SIZE} viewBox="0 0 12 12">
      <Path d={CHECK_MARK_PATH} fill={color} fillRule="evenodd" clipRule="evenodd" />
    </Svg>
  );
}

/**
 * Chrome's WebUI switch (cr-toggle), drawn only: the row around it carries the switch role and
 * name, as each row of the 工具栏 page is clickable as a whole. Pressing the toggle itself flips
 * it too and grows the knob, as cr-toggle does.
 */
export function ChromeToggle({
  isChecked,
  onToggle,
}: {
  isChecked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessible={false}
      focusable={false}
      onPress={onToggle}
      style={[styles.toggleBar, isChecked ? styles.toggleBarOn : styles.toggleBarOff]}
    >
      {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
        <View
          style={[
            styles.toggleKnob,
            toggleKnobFrame({ isChecked, isPressed: pressed }),
            isChecked ? styles.toggleKnobOn : styles.toggleKnobOff,
            isChecked && (hovered || pressed) && styles.toggleKnobOnActive,
          ]}
        />
      )}
    </Pressable>
  );
}

// cr_toggle.css: a 26 × 16 bar with a 1 px border; the knob's center sits 8 from the bar's end.
const TOGGLE_WIDTH = 26;
const TOGGLE_HEIGHT = 16;
const TOGGLE_BORDER = 1;
const TOGGLE_KNOB_INSET = 8;
const TOGGLE_KNOB_OFF = 8;
const TOGGLE_KNOB_ON = 12;
// The knob grows by 2 while pressed.
const TOGGLE_KNOB_PRESS_GROWTH = 2;
const TOGGLE_TRANSITION = "80ms";

function toggleKnobFrame(input: { isChecked: boolean; isPressed: boolean }) {
  const restingDiameter = input.isChecked ? TOGGLE_KNOB_ON : TOGGLE_KNOB_OFF;
  const diameter = input.isPressed ? restingDiameter + TOGGLE_KNOB_PRESS_GROWTH : restingDiameter;
  const centerX = input.isChecked ? TOGGLE_WIDTH - TOGGLE_KNOB_INSET : TOGGLE_KNOB_INSET;
  // The knob is placed inside the border, so its offsets leave the border out.
  return {
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    left: centerX - diameter / 2 - TOGGLE_BORDER,
    top: TOGGLE_HEIGHT / 2 - diameter / 2 - TOGGLE_BORDER,
  };
}

const ThemedCheckMark = withUnistyles(CheckMark);
const checkMarkMapping = chromeColorProps("buttonProminentText");

const DIALOG_BUTTON_HEIGHT = 32;
// Chrome's DISTANCE_DIALOG_BUTTON_MINIMUM_WIDTH and button label padding.
const DIALOG_BUTTON_MIN_WIDTH = 64;
const DIALOG_BUTTON_PADDING = 16;
// cr-checkbox: --cr-checkbox-size and --cr-checkbox-label-padding-start; rows as in Settings.
const CHECKBOX_SIZE = 16;
const CHECKBOX_LABEL_GAP = 20;
const CHECKBOX_ROW_HEIGHT = 40;

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    toolbarButton: {
      width: CHROME_LAYOUT.toolbarButtonSize,
      height: CHROME_LAYOUT.toolbarButtonSize,
      borderRadius: CHROME_LAYOUT.toolbarButtonSize / 2,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    toolbarButtonHovered: {
      backgroundColor: chrome.toolbarHover,
    },
    toolbarButtonPressed: {
      backgroundColor: chrome.toolbarPressed,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
    // 9 dip each side of the bar, counting the toolbar's 2 dip gap.
    toolbarDivider: {
      width: 2,
      height: 16,
      borderRadius: 1,
      marginHorizontal: CHROME_LAYOUT.locationBarMargin - CHROME_LAYOUT.toolbarButtonSpacing,
      backgroundColor: chrome.toolbarDivider,
      flexShrink: 0,
    },
    toggleBar: {
      width: TOGGLE_WIDTH,
      height: TOGGLE_HEIGHT,
      borderRadius: TOGGLE_HEIGHT / 2,
      borderWidth: TOGGLE_BORDER,
      flexShrink: 0,
      transitionProperty: "background-color, border-color",
      transitionDuration: TOGGLE_TRANSITION,
      transitionTimingFunction: "linear",
    },
    toggleBarOn: {
      backgroundColor: chrome.toggleOnTrack,
      borderColor: chrome.toggleOnTrack,
    },
    toggleBarOff: {
      backgroundColor: chrome.toggleOffTrack,
      borderColor: chrome.toggleOffKnob,
    },
    toggleKnob: {
      position: "absolute",
      transitionProperty: "left, top, width, height, background-color",
      transitionDuration: TOGGLE_TRANSITION,
      transitionTimingFunction: "linear",
    },
    toggleKnobOn: {
      backgroundColor: chrome.toggleOnKnob,
    },
    toggleKnobOnActive: {
      backgroundColor: chrome.toggleOnKnobActive,
    },
    toggleKnobOff: {
      backgroundColor: chrome.toggleOffKnob,
    },
    dialogButton: {
      height: DIALOG_BUTTON_HEIGHT,
      minWidth: DIALOG_BUTTON_MIN_WIDTH,
      paddingHorizontal: DIALOG_BUTTON_PADDING,
      borderRadius: DIALOG_BUTTON_HEIGHT / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    dialogButtonProminent: {
      backgroundColor: chrome.buttonProminent,
    },
    dialogButtonTonal: {
      borderWidth: 1,
      borderColor: chrome.buttonBorder,
    },
    dialogButtonHovered: {
      opacity: 0.92,
    },
    dialogButtonPressed: {
      opacity: 0.84,
    },
    dialogButtonDisabled: {
      opacity: 0.38,
    },
    dialogButtonLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      fontWeight: "500",
    },
    dialogButtonLabelProminent: {
      color: chrome.buttonProminentText,
    },
    dialogButtonLabelTonal: {
      color: chrome.buttonText,
    },
    checkboxRow: {
      minHeight: CHECKBOX_ROW_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: CHECKBOX_LABEL_GAP,
    },
    checkboxRowDisabled: {
      opacity: 0.38,
    },
    checkbox: {
      width: CHECKBOX_SIZE,
      height: CHECKBOX_SIZE,
      borderWidth: 2,
      borderRadius: 2,
      borderColor: chrome.checkboxBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      borderColor: chrome.buttonProminent,
      backgroundColor: chrome.buttonProminent,
    },
    checkboxLabel: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      color: chrome.bubbleText,
    },
  };
});
