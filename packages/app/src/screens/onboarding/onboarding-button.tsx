import { useCallback, useState, type ComponentType } from "react";
import { Pressable, Text } from "react-native";
import type { PressableStateCallbackType, StyleProp, TextStyle, ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { codePilotLight } from "@/styles/codepilot-theme";

export type OnboardingButtonVariant = "primary" | "outline" | "ghost";

interface OnboardingButtonProps {
  variant: OnboardingButtonVariant;
  children: string;
  onPress: () => void;
  leftIcon?: ComponentType<{ color: string; size: number }>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

// Stacks the codePilot Primer button surface for a variant across hover/press/focus —
// solid-blue primary, grey-outline secondary, transparent ghost; blue focus ring on web only.
function buttonSurface(
  variant: OnboardingButtonVariant,
  hovered: boolean,
  pressed: boolean,
  focused: boolean,
  override: StyleProp<ViewStyle>,
): StyleProp<ViewStyle> {
  const layers: StyleProp<ViewStyle>[] = [styles.base, styles[variant]];
  if (variant === "primary") {
    if (pressed) layers.push(styles.primaryPressed);
    else if (hovered) layers.push(styles.primaryHover);
  } else if (variant === "outline") {
    if (hovered || pressed) layers.push(styles.outlineHover);
  } else if (hovered || pressed) {
    layers.push(styles.ghostHover);
  }
  if (focused && isWeb && variant !== "ghost") {
    layers.push(styles.focusRing);
  }
  layers.push(override);
  return layers;
}

// Label style per variant — ghost is the only one that darkens (muted → foreground) on hover.
function labelStyle(variant: OnboardingButtonVariant, hovered: boolean): StyleProp<TextStyle> {
  if (variant === "primary") return styles.labelOnPrimary;
  if (variant === "outline") return styles.labelOnSurface;
  return hovered ? styles.labelOnSurface : styles.labelMuted;
}

// Icon ink mirrors the label color; lucide needs it as a plain color string prop.
function inkColor(variant: OnboardingButtonVariant, hovered: boolean): string {
  if (variant === "primary") return codePilotLight.onPrimary;
  if (variant === "outline") return codePilotLight.foreground;
  return hovered ? codePilotLight.foreground : codePilotLight.foregroundMuted;
}

// codePilot onboarding action button — fixed light theme, self-contained hover/press/focus, no global-theme coupling.
export function OnboardingButton({
  variant,
  children,
  onPress,
  leftIcon: Icon,
  testID,
  style,
}: OnboardingButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const surface = useCallback(
    ({ pressed }: PressableStateCallbackType) =>
      buttonSurface(variant, hovered, pressed, focused, style),
    [variant, hovered, focused, style],
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={surface}
    >
      {Icon ? <Icon color={inkColor(variant, hovered)} size={16} /> : null}
      <Text style={labelStyle(variant, hovered)}>{children}</Text>
    </Pressable>
  );
}

interface OnboardingLinkProps {
  children: string;
  onPress: () => void;
  testID?: string;
}

// Blue text link (welcome's "connect remote") — underlines on hover, fixed codePilot blue.
export function OnboardingLink({ children, onPress, testID }: OnboardingLinkProps) {
  const [hovered, setHovered] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      testID={testID}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={styles.linkPressable}
    >
      <Text style={hovered ? styles.linkTextHovered : styles.linkText}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  primary: {
    backgroundColor: codePilotLight.primary,
    borderColor: codePilotLight.borderOnPrimary,
  },
  primaryHover: {
    backgroundColor: codePilotLight.primaryHover,
  },
  primaryPressed: {
    backgroundColor: codePilotLight.primaryActive,
    transform: [{ scale: 0.99 }],
  },
  outline: {
    backgroundColor: codePilotLight.hoverSurface,
    borderColor: codePilotLight.border,
  },
  outlineHover: {
    backgroundColor: codePilotLight.muted,
  },
  ghost: {
    width: "auto",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: "transparent",
  },
  ghostHover: {
    backgroundColor: codePilotLight.hoverSurface,
  },
  focusRing: {
    boxShadow: `0 0 0 3px ${codePilotLight.focusRing}`,
  },
  labelOnPrimary: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: codePilotLight.onPrimary,
  },
  labelOnSurface: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: codePilotLight.foreground,
  },
  labelMuted: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: codePilotLight.foregroundMuted,
  },
  linkPressable: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  linkText: {
    color: codePilotLight.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  linkTextHovered: {
    color: codePilotLight.primary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
    textDecorationLine: "underline",
  },
}));
