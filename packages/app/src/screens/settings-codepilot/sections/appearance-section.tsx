// Appearance — theme picker (swatch/icon tiles) + interface/code font-size presets, all
// writing AppSettings via useAppSettings so a tap applies live. Pure re-skin: the data
// wiring (theme, font sizes) is reused unchanged from the legacy Appearance; only the
// presentation moves to the codePilot kit. The component renders + dispatches; the only
// logic is the pure `themeLabel` resolver and trivial size parsing.
//
// Deferred on purpose (still editable in the legacy Appearance screen until ported):
//   - TODO(appearance): freeform UI / mono font-FAMILY inputs — the codePilot kit has no
//     text-input primitive yet, and the task scopes this pass to Toggle/Segmented/Select.
//   - TODO(appearance): syntax-highlight theme picker + live Shiki code preview — skipped
//     to keep the heavy @getpaseo/highlight dependency out of this section.
import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { TFunction } from "i18next";
import { Check, Monitor } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useAppSettings, type AppSettings } from "@/hooks/use-settings";
import { THEME_SWATCHES } from "@/styles/theme";
import {
  SettingsCard,
  SettingsDetail,
  SettingsGroup,
  SettingsRow,
  SettingsSegmented,
} from "../primitives";

type ThemeChoice = AppSettings["theme"];

// Theme tiles in display order: the codePilot brand default first, then the light/dark/
// system modes, then the dark color variants. "auto" tracks the OS so it has no swatch and
// renders the Monitor glyph; every other value shows its THEME_SWATCHES color.
const THEME_CHOICES: readonly ThemeChoice[] = [
  "codePilot",
  "light",
  "dark",
  "auto",
  "zinc",
  "midnight",
  "claude",
  "ghostty",
];

// Localized option keys for every theme except "codePilot" (a brand name with no localized
// option key — shown verbatim). Mirrors the legacy Appearance label table 1:1.
const THEME_OPTION_KEYS: Record<Exclude<ThemeChoice, "codePilot">, string> = {
  light: "settings.appearance.theme.options.light",
  dark: "settings.appearance.theme.options.dark",
  auto: "settings.appearance.theme.options.auto",
  zinc: "settings.appearance.theme.options.zinc",
  midnight: "settings.appearance.theme.options.midnight",
  claude: "settings.appearance.theme.options.claude",
  ghostty: "settings.appearance.theme.options.ghostty",
};

// Font-size presets. Each id is the px value as a string (SettingsSegmented keys on
// strings); every preset sits inside the clamp range so no extra validation is needed.
const UI_SIZE_OPTIONS: { id: string; label: string }[] = [
  { id: "14", label: "14" },
  { id: "16", label: "16" },
  { id: "18", label: "18" },
  { id: "20", label: "20" },
];
const CODE_SIZE_OPTIONS: { id: string; label: string }[] = [
  { id: "11", label: "11" },
  { id: "12", label: "12" },
  { id: "14", label: "14" },
  { id: "16", label: "16" },
];

// Display label for a theme value: the codePilot brand name verbatim, every other value
// from its settings.appearance option key.
function themeLabel(t: TFunction, value: ThemeChoice): string {
  if (value === "codePilot") {
    return "CodePilot";
  }
  return t(THEME_OPTION_KEYS[value]);
}

// One selectable theme tile: a swatch (or the Monitor glyph for "auto") + label, with a
// check + accent border when it's the active theme. Owns its own press handler/styles so
// they stay stable per the repo's react-perf rule.
function ThemeTile({
  value,
  selected,
  onSelect,
}: {
  value: ThemeChoice;
  selected: boolean;
  onSelect: (value: ThemeChoice) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const label = useMemo(() => themeLabel(t, value), [t, value]);
  const a11yLabel = useMemo(
    () => t("settings.appearance.theme.accessibilityLabel", { value: label }),
    [t, label],
  );
  const a11yState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  const swatchColor = useMemo(() => (value === "auto" ? null : THEME_SWATCHES[value]), [value]);
  const tileStyle = useMemo(
    () => (selected ? [styles.tile, styles.tileOn] : styles.tile),
    [selected],
  );
  const swatchStyle = useMemo(
    () => (swatchColor ? [styles.swatch, { backgroundColor: swatchColor }] : styles.swatch),
    [swatchColor],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={a11yState}
      accessibilityLabel={a11yLabel}
      onPress={handlePress}
      style={tileStyle}
    >
      <View style={swatchStyle}>
        {swatchColor ? null : <Monitor size={14} color={theme.colors.foregroundMuted} />}
      </View>
      <Text style={styles.tileText} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <Check size={14} color={theme.colors.accent} /> : null}
    </Pressable>
  );
}

// Appearance detail pane: theme grid + font-size presets. All controls dispatch into
// AppSettings and apply immediately.
export function AppearanceSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const uiSizeValue = useMemo(() => String(settings.uiFontSize), [settings.uiFontSize]);
  const codeSizeValue = useMemo(() => String(settings.codeFontSize), [settings.codeFontSize]);

  const handleTheme = useCallback(
    (nextTheme: ThemeChoice) => {
      void updateSettings({ theme: nextTheme });
    },
    [updateSettings],
  );
  const handleUiSize = useCallback(
    (next: string) => {
      const size = Number.parseInt(next, 10);
      if (Number.isFinite(size)) {
        void updateSettings({ uiFontSize: size });
      }
    },
    [updateSettings],
  );
  const handleCodeSize = useCallback(
    (next: string) => {
      const size = Number.parseInt(next, 10);
      if (Number.isFinite(size)) {
        void updateSettings({ codeFontSize: size });
      }
    },
    [updateSettings],
  );

  return (
    <SettingsDetail
      title={t("settings.sections.appearance")}
      subtitle="主题配色与字体大小，修改即时生效。"
    >
      <SettingsGroup title={t("settings.appearance.theme.title")}>
        <SettingsCard padded>
          <View style={styles.grid}>
            {THEME_CHOICES.map((value) => (
              <ThemeTile
                key={value}
                value={value}
                selected={value === settings.theme}
                onSelect={handleTheme}
              />
            ))}
          </View>
        </SettingsCard>
      </SettingsGroup>
      <SettingsGroup title={t("settings.appearance.fonts.title")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.appearance.fonts.interfaceSize")}
            description="应用界面文字的大小（默认 16）。"
          >
            <SettingsSegmented
              options={UI_SIZE_OPTIONS}
              value={uiSizeValue}
              onChange={handleUiSize}
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.appearance.fonts.codeSize")}
            description="代码、差异与终端输出的字号（默认 12）。"
            divider
          >
            <SettingsSegmented
              options={CODE_SIZE_OPTIONS}
              value={codeSizeValue}
              onChange={handleCodeSize}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
    </SettingsDetail>
  );
}

const styles = StyleSheet.create((theme) => ({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 150,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
  },
  tileOn: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface1,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tileText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
}));
