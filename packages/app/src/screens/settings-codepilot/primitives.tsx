// codePilot settings primitives — the reusable building blocks every settings section
// renders with, so the whole subsystem shares one visual language (CodePilot's
// SettingsCard / FieldRow / controls). Pure presentation + dispatch: no data fetching
// here. Style arrays/handlers are memoized to satisfy the repo's react-perf rule.
import { useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsKit } from "./styles";

type IconType = ComponentType<{ size?: number; color?: string }>;

// Static style-ref lookup maps (no theme dependency) hoisted so JSX never builds a
// fresh object each render.
const BTN_FILL = {
  primary: settingsKit.btnPrimary,
  outline: settingsKit.btnOutline,
  ghost: undefined,
  danger: settingsKit.btnDanger,
} as const;
const BTN_TEXT = {
  primary: settingsKit.btnPrimaryText,
  outline: settingsKit.btnOutlineText,
  ghost: settingsKit.btnGhostText,
  danger: settingsKit.btnDangerText,
} as const;
const BADGE_BOX = {
  muted: settingsKit.badgeMuted,
  success: settingsKit.badgeSuccess,
  warning: settingsKit.badgeWarn,
  error: settingsKit.badgeErr,
} as const;
const BADGE_TEXT = {
  muted: settingsKit.badgeMutedText,
  success: settingsKit.badgeSuccessText,
  warning: settingsKit.badgeWarnText,
  error: settingsKit.badgeErrText,
} as const;
const VALUE_TONE = {
  default: undefined,
  strong: settingsKit.valueStrong,
  warn: settingsKit.valueWarn,
  danger: settingsKit.valueDanger,
} as const;
const DOT_TONE = {
  on: settingsKit.dotOn,
  off: settingsKit.dotOff,
  idle: settingsKit.dotIdle,
} as const;

// The detail pane scaffold: a scrolling, max-width content column with the section
// title/subtitle on top. Renders into the shell's main card (which owns the frame).
export function SettingsDetail({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView style={settingsKit.contentScroll} contentContainerStyle={settingsKit.contentInner}>
      <View style={settingsKit.detailHeader}>
        <Text style={settingsKit.detailTitle}>{title}</Text>
        {subtitle ? <Text style={settingsKit.detailSub}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

// A titled group of cards. The optional right-aligned `action` slot mirrors the
// board's group header actions (e.g. "新增").
export function SettingsGroup({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={settingsKit.group}>
      {title || action ? (
        <View style={settingsKit.groupHeader}>
          {title ? <Text style={settingsKit.groupTitle}>{title}</Text> : <View />}
          {action ?? null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

// A bordered settings card. `padded` switches to CodePilot's p-5/space-y-4 inner spacing
// (for free-form content); the default holds full-bleed rows that draw their own dividers.
export function SettingsCard({ padded, children }: { padded?: boolean; children: ReactNode }) {
  const style = useMemo(
    () => (padded ? [settingsKit.card, settingsKit.cardPadded] : settingsKit.card),
    [padded],
  );
  return <View style={style}>{children}</View>;
}

// A field row: label (+ optional description + inline badge) on the left, control on the
// right. `divider` draws the top border between consecutive rows inside a card.
export function SettingsRow({
  label,
  description,
  badge,
  divider,
  children,
}: {
  label: string;
  description?: ReactNode;
  badge?: ReactNode;
  divider?: boolean;
  children?: ReactNode;
}) {
  const style = useMemo(
    () => (divider ? [settingsKit.row, settingsKit.rowDivider] : settingsKit.row),
    [divider],
  );
  return (
    <View style={style}>
      <View style={settingsKit.rowLeft}>
        <View style={settingsKit.rowLabel}>
          <Text style={settingsKit.rowLabelText}>{label}</Text>
          {badge ?? null}
        </View>
        {typeof description === "string" ? (
          <Text style={settingsKit.rowDesc}>{description}</Text>
        ) : (
          (description ?? null)
        )}
      </View>
      {children ? <View style={settingsKit.rowControl}>{children}</View> : null}
    </View>
  );
}

// On/off pill toggle. Stateless: the parent owns `value` and persists in `onChange`.
export function SettingsToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const handlePress = useCallback(() => onChange(!value), [onChange, value]);
  const a11yState = useMemo(() => ({ checked: value, disabled }), [value, disabled]);
  const trackStyle = useMemo(
    () => [
      settingsKit.toggleTrack,
      value ? settingsKit.toggleAlignOn : settingsKit.toggleAlignOff,
      value ? settingsKit.toggleTrackOn : null,
      disabled ? settingsKit.btnDisabled : null,
    ],
    [value, disabled],
  );
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={a11yState}
      disabled={disabled}
      onPress={handlePress}
      style={trackStyle}
    >
      <View style={settingsKit.toggleThumb} />
    </Pressable>
  );
}

// One segment of a SettingsSegmented control (its own component so the per-item press
// handler + style stay stable).
function SegmentButton<T extends string>({
  id,
  label,
  active,
  onSelect,
}: {
  id: T;
  label: string;
  active: boolean;
  onSelect: (id: T) => void;
}) {
  const handlePress = useCallback(() => onSelect(id), [onSelect, id]);
  const a11yState = useMemo(() => ({ selected: active }), [active]);
  const style = useMemo(
    () => (active ? [settingsKit.segment, settingsKit.segmentOn] : settingsKit.segment),
    [active],
  );
  const textStyle = useMemo(
    () => (active ? [settingsKit.segmentText, settingsKit.segmentTextOn] : settingsKit.segmentText),
    [active],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={a11yState}
      onPress={handlePress}
      style={style}
    >
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

// Segmented control — a horizontal radio group of short labels. `value` matches one
// option `id`; selecting dispatches `onChange`.
export function SettingsSegmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={settingsKit.segmented}>
      {options.map((option) => (
        <SegmentButton
          key={option.id}
          id={option.id}
          label={option.label}
          active={option.id === value}
          onSelect={onChange}
        />
      ))}
    </View>
  );
}

// A select trigger: shows the current value + chevron and opens the parent's picker on
// press. The picker UI itself is owned by the caller (menu / dialog).
export function SettingsSelect({
  label,
  onPress,
  minWidth,
}: {
  label: string;
  onPress: () => void;
  minWidth?: number;
}) {
  const { theme } = useUnistyles();
  const style = useMemo(
    () => (minWidth != null ? [settingsKit.select, { minWidth }] : settingsKit.select),
    [minWidth],
  );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={style}>
      <Text style={settingsKit.selectText} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

// A settings button. Variant drives the fill/border/text token set; `icon` is an optional
// leading glyph. Stateless — the caller handles the press.
export function SettingsButton({
  label,
  onPress,
  variant = "outline",
  icon: Icon,
  small,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconType;
  small?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useUnistyles();
  const style = useMemo(
    () => [
      settingsKit.btn,
      BTN_FILL[variant] ?? null,
      small ? settingsKit.btnSm : null,
      disabled ? settingsKit.btnDisabled : null,
    ],
    [variant, small, disabled],
  );
  const textStyle = useMemo(() => [settingsKit.btnText, BTN_TEXT[variant]], [variant]);
  const a11yState = useMemo(() => ({ disabled }), [disabled]);
  const iconColor = useMemo(() => {
    if (variant === "primary") return theme.colors.accentForeground ?? "#ffffff";
    if (variant === "danger") return theme.colors.destructive;
    if (variant === "ghost") return theme.colors.foregroundMuted;
    return theme.colors.foreground;
  }, [variant, theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={a11yState}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      {Icon ? <Icon size={theme.iconSize.sm} color={iconColor} /> : null}
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

type BadgeTone = "muted" | "success" | "warning" | "error";

// A small status badge. Tone selects the foreground token; the fill stays a flat surface.
export function SettingsBadge({
  label,
  tone = "muted",
  icon: Icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: IconType;
}) {
  const { theme } = useUnistyles();
  const box = useMemo(() => [settingsKit.badge, BADGE_BOX[tone]], [tone]);
  const text = useMemo(() => [settingsKit.badgeText, BADGE_TEXT[tone]], [tone]);
  const color = {
    muted: theme.colors.foregroundMuted,
    success: theme.colors.statusSuccess,
    warning: theme.colors.statusWarning,
    error: theme.colors.destructive,
  }[tone];
  return (
    <View style={box}>
      {Icon ? <Icon size={11} color={color} /> : null}
      <Text style={text}>{label}</Text>
    </View>
  );
}

type ValueTone = "default" | "strong" | "warn" | "danger";

// A monospace-ish value readout (version numbers, ids). Tone tints mismatches/offline.
export function SettingsValue({ value, tone = "default" }: { value: string; tone?: ValueTone }) {
  const style = useMemo(() => [settingsKit.value, VALUE_TONE[tone]], [tone]);
  return <Text style={style}>{value}</Text>;
}

// A colored connection dot: on (green), off (red), idle (gray).
export function SettingsStatusDot({ status }: { status: "on" | "off" | "idle" }) {
  const style = useMemo(() => [settingsKit.dot, DOT_TONE[status]], [status]);
  return <View style={style} />;
}

// An inline alert / banner with a leading icon, title and optional description.
export function SettingsAlert({
  title,
  description,
  icon: Icon,
  tone = "info",
}: {
  title: string;
  description?: string;
  icon?: IconType;
  tone?: "info" | "warning" | "error";
}) {
  const { theme } = useUnistyles();
  const color = {
    info: theme.colors.accent,
    warning: theme.colors.statusWarning,
    error: theme.colors.destructive,
  }[tone];
  return (
    <View style={settingsKit.alert}>
      {Icon ? <Icon size={theme.iconSize.sm} color={color} /> : null}
      <View style={settingsKit.flexFill}>
        <Text style={settingsKit.alertTitle}>{title}</Text>
        {description ? <Text style={settingsKit.alertDesc}>{description}</Text> : null}
      </View>
    </View>
  );
}

// A dashed empty-state box with a centered message + optional action.
export function SettingsEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <View style={settingsKit.empty}>
      <Text style={settingsKit.emptyText}>{message}</Text>
      {action ?? null}
    </View>
  );
}
