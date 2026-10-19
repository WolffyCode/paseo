import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { WebUiIcon, type WebUiIconName } from "./icons";
import { WEBUI_LAYOUT, webUiColorProps } from "./theme";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const iconButtonMapping = webUiColorProps("iconButton");
const textMapping = webUiColorProps("text");

/** cr-button: an outlined pill, or the filled `action-button` that confirms. */
export function CrButton({
  label,
  isAction = false,
  onPress,
  testID,
}: {
  label: string;
  isAction?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const buttonStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.button,
      isAction ? styles.actionButton : styles.outlinedButton,
      hovered && (isAction ? styles.actionButtonHovered : styles.outlinedButtonHovered),
      pressed && styles.buttonPressed,
    ],
    [isAction],
  );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={buttonStyle} testID={testID}>
      <Text style={[styles.buttonLabel, isAction && styles.actionButtonLabel]}>{label}</Text>
    </Pressable>
  );
}

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

/** cr-icon-button: a 32 dip round button around a 20 dip glyph. */
export function CrIconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: WebUiIconName;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={iconButtonStyle}
      testID={testID}
    >
      <ThemedWebUiIcon name={icon} size={WEBUI_LAYOUT.iconSize} uniProps={iconButtonMapping} />
    </Pressable>
  );
}

function iconButtonStyle({ hovered, pressed }: HoverState) {
  return [styles.iconButton, hovered && styles.hovered, pressed && styles.pressed];
}

/**
 * cr-link-row: a 48 dip row that opens something. External destinations end in open-in-new,
 * pages of the same WebUI in a chevron.
 */
export function CrLinkRow({
  label,
  isExternal,
  hasSeparator = true,
  isDisabled = false,
  onPress,
  testID,
}: {
  label: string;
  isExternal: boolean;
  hasSeparator?: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const rowStyle = useCallback(
    ({ hovered, pressed }: HoverState) => [
      styles.linkRow,
      hasSeparator && styles.separatorAbove,
      hovered && styles.hovered,
      pressed && styles.pressed,
    ],
    [hasSeparator],
  );
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={rowStyle} testID={testID}>
      <Text style={styles.linkRowLabel}>{label}</Text>
      <View style={[styles.linkRowIcon, isDisabled && styles.linkRowIconDisabled]}>
        <ThemedWebUiIcon
          name={isExternal ? "openInNew" : "chevronRight"}
          size={WEBUI_LAYOUT.iconSize}
          uniProps={textMapping}
        />
      </View>
    </Pressable>
  );
}

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
const DISABLED_OPACITY = 0.38;

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
      borderColor: colors.toggleOffBorder,
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
      backgroundColor: colors.toggleOffBorder,
    },
    toggleHover: {
      position: "absolute",
      width: TOGGLE_HOVER_RING,
      height: TOGGLE_HOVER_RING,
      borderRadius: TOGGLE_HOVER_RING / 2,
      backgroundColor: colors.toggleHover,
    },
    iconButton: {
      width: WEBUI_LAYOUT.iconButtonSize,
      height: WEBUI_LAYOUT.iconButtonSize,
      borderRadius: WEBUI_LAYOUT.iconButtonSize / 2,
      alignItems: "center",
      justifyContent: "center",
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
    linkRowLabel: {
      ...text,
      flex: 1,
      paddingVertical: WEBUI_LAYOUT.sectionVerticalPadding,
      color: colors.text,
    },
    linkRowIcon: {
      width: WEBUI_LAYOUT.iconButtonSize,
      height: WEBUI_LAYOUT.iconButtonSize,
      marginLeft: LINK_ROW_ICON_MARGIN_START,
      marginRight: LINK_ROW_ICON_MARGIN_END,
      alignItems: "center",
      justifyContent: "center",
    },
    linkRowIconDisabled: {
      opacity: DISABLED_OPACITY,
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
