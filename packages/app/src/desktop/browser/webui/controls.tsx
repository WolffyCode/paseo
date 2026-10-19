import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { useFocusVisible } from "./focus-visible";
import { WebUiIcon, type WebUiIconName } from "./icons";
import { CrHighlightedText } from "./search-highlight";
import { WEBUI_LAYOUT, webUiColorProps } from "./theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const iconButtonMapping = webUiColorProps("iconButton");
const startIconMapping = webUiColorProps("icon");

/** cr-button: an outlined pill, or the filled `action-button` that confirms. */
export const CrButton = forwardRef<
  View,
  {
    label: string;
    /** aria-label, where the visible label leaves out what the button acts on. */
    accessibilityLabel?: string;
    isAction?: boolean;
    isDisabled?: boolean;
    onPress: () => void;
    testID?: string;
  }
>(function CrButton(
  { label, accessibilityLabel, isAction = false, isDisabled = false, onPress, testID },
  ref,
) {
  const buttonStyle = useCallback(
    ({ hovered, pressed }: HoverState) => {
      if (isDisabled) {
        return [
          styles.button,
          isAction ? styles.actionButtonDisabled : styles.outlinedButtonDisabled,
        ];
      }
      return [
        styles.button,
        isAction ? styles.actionButton : styles.outlinedButton,
        hovered && (isAction ? styles.actionButtonHovered : styles.outlinedButtonHovered),
        pressed && styles.buttonPressed,
      ];
    },
    [isAction, isDisabled],
  );
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={isDisabled}
      onPress={onPress}
      style={buttonStyle}
      testID={testID}
    >
      <Text
        style={[
          styles.buttonLabel,
          isAction && styles.actionButtonLabel,
          isDisabled && styles.buttonLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

// cr-toggle: a 26 x 16 bar with a 1 px border; the knob's center sits 8 dip in when off and
// 18 when on, 8 dip across off and 12 on.
const TOGGLE_WIDTH = 26;
const TOGGLE_HEIGHT = 16;
const TOGGLE_KNOB_OFF = 8;
const TOGGLE_KNOB_ON = 12;
const TOGGLE_KNOB_CENTER_OFF = 8;
const TOGGLE_KNOB_CENTER_ON = 18;
const TOGGLE_HOVER_RING = 20;

/** cr-toggle, the switch of Chrome's settings and extensions pages. */
export function CrToggle({
  label,
  isOn,
  onChange,
  testID,
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
  testID?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const toggle = useCallback(() => onChange(!isOn), [isOn, onChange]);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const knobCenter = isOn ? TOGGLE_KNOB_CENTER_ON : TOGGLE_KNOB_CENTER_OFF;
  const knobSize = isOn ? TOGGLE_KNOB_ON : TOGGLE_KNOB_OFF;
  const knobPosition = useMemo(
    () => ({
      left: knobCenter - knobSize / 2 - 1,
      top: (TOGGLE_HEIGHT - knobSize) / 2 - 1,
      width: knobSize,
      height: knobSize,
      borderRadius: knobSize / 2,
    }),
    [knobCenter, knobSize],
  );
  const hoverPosition = useMemo(
    () => ({
      left: knobCenter - TOGGLE_HOVER_RING / 2 - 1,
      top: (TOGGLE_HEIGHT - TOGGLE_HOVER_RING) / 2 - 1,
    }),
    [knobCenter],
  );
  return (
    <View onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        aria-checked={isOn}
        onPress={toggle}
        testID={testID}
        style={[styles.toggleBar, isOn ? styles.toggleBarOn : styles.toggleBarOff]}
      >
        <View
          style={[
            styles.toggleKnob,
            knobPosition,
            isOn ? styles.toggleKnobOn : styles.toggleKnobOff,
            isOn && isHovered && styles.toggleKnobOnHovered,
          ]}
        />
        {isHovered ? (
          <View pointerEvents="none" style={[styles.toggleHover, hoverPosition]} />
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * cr-icon-button: a 32 dip round button around a 20 dip glyph, ringed while it has keyboard focus.
 */
export const CrIconButton = forwardRef<
  View,
  {
    icon: WebUiIconName;
    label: string;
    /** cr-link-row's button is a link: it opens a page. */
    role?: "button" | "link";
    isDisabled?: boolean;
    /**
     * cr-actionable-row-style: in a row that is pressable as a whole, the row shows hover and
     * press, and the button doesn't.
     */
    isInActionableRow?: boolean;
    onPress: () => void;
    testID?: string;
  }
>(function CrIconButton(
  { icon, label, role = "button", isDisabled = false, isInActionableRow = false, onPress, testID },
  ref,
) {
  const { isFocusVisible, handleFocus, handleBlur } = useFocusVisible();
  // RN Web leaves Enter on a link to the browser, which follows only a real address.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (role !== "link" || event.key !== "Enter") return;
      event.preventDefault();
      onPress();
    },
    [onPress, role],
  );
  const buttonStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.iconButton,
      !isInActionableRow && hovered && styles.hovered,
      !isInActionableRow && pressed && styles.pressed,
      isFocusVisible && styles.iconButtonFocused,
      isDisabled && styles.iconButtonDisabled,
    ],
    [isDisabled, isFocusVisible, isInActionableRow],
  );
  return (
    <Pressable
      ref={ref}
      accessibilityRole={role}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={buttonStyle}
      testID={testID}
    >
      <ThemedWebUiIcon name={icon} size={WEBUI_LAYOUT.iconSize} uniProps={iconButtonMapping} />
    </Pressable>
  );
});

/**
 * cr-link-row: a 48 dip row that opens something, its label optionally under a start icon and
 * over a sublabel. External destinations end in open-in-new, pages of the same WebUI in a chevron.
 * The whole row presses, but only that end button takes focus, so a ref to the row focuses it.
 */
export const CrLinkRow = forwardRef<
  View,
  {
    label: string;
    subLabel?: string;
    startIcon?: WebUiIconName;
    isExternal: boolean;
    hasSeparator?: boolean;
    isDisabled?: boolean;
    onPress: () => void;
    testID?: string;
  }
>(function CrLinkRow(
  {
    label,
    subLabel,
    startIcon,
    isExternal,
    hasSeparator = true,
    isDisabled = false,
    onPress,
    testID,
  },
  ref,
) {
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.linkRow,
      hasSeparator && styles.separatorAbove,
      hovered && styles.hovered,
      pressed && styles.pressed,
    ],
    [hasSeparator],
  );
  // The button is aria-labelledby the label and the sublabel.
  const buttonLabel = subLabel ? `${label} ${subLabel}` : label;
  return (
    <Pressable
      disabled={isDisabled}
      tabIndex={-1}
      onPress={onPress}
      style={rowStyle}
      testID={testID}
    >
      {startIcon ? (
        <View style={styles.linkRowStartIcon}>
          <ThemedWebUiIcon
            name={startIcon}
            size={WEBUI_LAYOUT.iconSize}
            uniProps={startIconMapping}
          />
        </View>
      ) : null}
      <View style={styles.linkRowLabels}>
        <CrHighlightedText text={label} style={styles.linkRowLabel} />
        {subLabel ? <CrHighlightedText text={subLabel} style={styles.secondaryText} /> : null}
      </View>
      <View style={styles.linkRowButton}>
        <CrIconButton
          ref={ref}
          icon={isExternal ? "openInNew" : "chevronRight"}
          label={buttonLabel}
          role="link"
          isDisabled={isDisabled}
          isInActionableRow
          onPress={onPress}
        />
      </View>
    </Pressable>
  );
});

/** A row of a WebUI card with its own content, under a separator line. */
export function CrSection({
  title,
  hasSeparator = true,
  children,
}: {
  title?: string;
  hasSeparator?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, hasSeparator && styles.separatorAbove]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

// The trailing icon button keeps cr-icon-button's 16 / -8 margins, so its glyph ends 18 dip from
// the row's end.
const LINK_ROW_ICON_MARGIN_START = 16;
const LINK_ROW_ICON_MARGIN_END = -8;
// cr-link-row's #startIcon: 16 dip before the label.
const LINK_ROW_START_ICON_GAP = 16;
const DISABLED_OPACITY = 0.38;
// cr-icon-button's keyboard focus: a 2 dip ring inside the button.
const FOCUS_OUTLINE_WIDTH = 2;

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  const text = {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: WEBUI_LAYOUT.fontSize,
    lineHeight: WEBUI_LAYOUT.lineHeight,
  };
  return {
    button: {
      height: WEBUI_LAYOUT.buttonHeight,
      minWidth: 66.8,
      paddingHorizontal: 16,
      borderRadius: WEBUI_LAYOUT.buttonHeight / 2,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    outlinedButton: {
      borderWidth: 1,
      borderColor: colors.buttonBorder,
    },
    outlinedButtonHovered: {
      backgroundColor: colors.hover,
    },
    actionButton: {
      backgroundColor: colors.actionButton,
    },
    outlinedButtonDisabled: {
      borderWidth: 1,
      borderColor: colors.disabledBackground,
    },
    actionButtonDisabled: {
      backgroundColor: colors.disabledBackground,
    },
    actionButtonHovered: {
      boxShadow: `inset 0 0 0 ${WEBUI_LAYOUT.buttonHeight}px ${colors.actionButtonHover}`,
    },
    buttonPressed: {
      opacity: 0.88,
    },
    buttonLabel: {
      ...text,
      fontWeight: "500",
      color: colors.buttonText,
    },
    actionButtonLabel: {
      color: colors.actionButtonText,
    },
    buttonLabelDisabled: {
      color: colors.disabledForeground,
    },
    toggleBar: {
      width: TOGGLE_WIDTH,
      height: TOGGLE_HEIGHT,
      borderRadius: TOGGLE_HEIGHT / 2,
      borderWidth: 1,
    },
    toggleBarOn: {
      backgroundColor: colors.toggleOn,
      borderColor: colors.toggleOn,
    },
    toggleBarOff: {
      backgroundColor: colors.toggleOff,
      borderColor: colors.outline,
    },
    toggleKnob: {
      position: "absolute",
    },
    toggleKnobOn: {
      backgroundColor: colors.toggleOnKnob,
    },
    toggleKnobOnHovered: {
      backgroundColor: colors.toggleOnKnobHover,
    },
    toggleKnobOff: {
      backgroundColor: colors.outline,
    },
    toggleHover: {
      position: "absolute",
      width: TOGGLE_HOVER_RING,
      height: TOGGLE_HOVER_RING,
      borderRadius: TOGGLE_HOVER_RING / 2,
      backgroundColor: colors.hoverOnSubtle,
    },
    iconButton: {
      width: WEBUI_LAYOUT.iconButtonSize,
      height: WEBUI_LAYOUT.iconButtonSize,
      borderRadius: WEBUI_LAYOUT.iconButtonSize / 2,
      alignItems: "center",
      justifyContent: "center",
      outlineWidth: 0,
    },
    iconButtonFocused: {
      boxShadow: `inset 0 0 0 ${FOCUS_OUTLINE_WIDTH}px ${colors.focusOutline}`,
    },
    iconButtonDisabled: {
      opacity: DISABLED_OPACITY,
    },
    hovered: {
      backgroundColor: colors.hover,
    },
    pressed: {
      backgroundColor: colors.pressed,
    },
    separatorAbove: {
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    linkRow: {
      minHeight: WEBUI_LAYOUT.rowMinHeight,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    linkRowStartIcon: {
      marginRight: LINK_ROW_START_ICON_GAP,
    },
    linkRowLabels: {
      flex: 1,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
    },
    linkRowLabel: {
      ...text,
      color: colors.text,
    },
    linkRowButton: {
      marginLeft: LINK_ROW_ICON_MARGIN_START,
      marginRight: LINK_ROW_ICON_MARGIN_END,
    },
    section: {
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
      paddingHorizontal: WEBUI_LAYOUT.rowPadding,
    },
    sectionTitle: {
      ...text,
      color: colors.text,
    },
    secondaryText: {
      ...text,
      color: colors.textSecondary,
    },
    inlineLink: {
      color: colors.link,
      textDecorationLine: "underline",
    },
  };
});

/** Text inside a WebUI section: the base font in the secondary color. */
export function CrSecondaryText({ children }: { children: ReactNode }) {
  return <Text style={styles.secondaryText}>{children}</Text>;
}

/** Marks where the link goes in a translated sentence: pass it as the `link` value. */
export const LINK_SLOT = "\u0000";

/** A sentence with one inline link, underlined in the link color, as WebUI pages write them. */
export function CrLinkedText({
  text,
  linkLabel,
  onLinkPress,
  style,
}: {
  /** The translation, given LINK_SLOT for its link. */
  text: string;
  linkLabel: string;
  onLinkPress: () => void;
  style: StyleProp<TextStyle>;
}) {
  const [beforeLink = "", afterLink = ""] = text.split(LINK_SLOT);
  return (
    <Text style={style}>
      {beforeLink}
      <Text accessibilityRole="link" onPress={onLinkPress} style={styles.inlineLink}>
        {linkLabel}
      </Text>
      {afterLink}
    </Text>
  );
}
