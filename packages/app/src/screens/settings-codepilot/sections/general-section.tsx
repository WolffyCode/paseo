// General — the first behavior settings section rebuilt on the codePilot kit. Holds
// default-send behavior, app language, the desktop "open service URLs" target, and the
// terminal scrollback line count. Pure re-skin + dispatch: every read/write still flows
// through useAppSettings() and the kit primitives own all presentation. The language /
// service-URL pickers are intentionally inert triggers here (see handlePickerTodo) — the
// floating menu host is wired separately by the dispatcher, so only the trigger lives here.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, TextInput } from "react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { getIsElectron } from "@/constants/platform";
import {
  parseTerminalScrollbackLines,
  useAppSettings,
  type SendBehavior,
  type ServiceUrlBehavior,
} from "@/hooks/use-settings";
import {
  formatLanguageOptionLabel,
  LANGUAGE_OPTIONS,
  parseAppLanguage,
  type SupportedLocale,
} from "@/i18n/locales";
import {
  SettingsCard,
  SettingsDetail,
  SettingsGroup,
  SettingsRow,
  SettingsSegmented,
  SettingsSelect,
} from "../primitives";
import { settingsKit } from "../styles";

// The numeric scrollback box has no kit primitive; size it locally (no color literals —
// its bordered surface + foreground color still come from settingsKit.input).
const localStyles = StyleSheet.create({
  scrollbackInput: {
    minWidth: 88,
    textAlign: "right",
  },
});
const SCROLLBACK_INPUT_STYLE = [settingsKit.input, localStyles.scrollbackInput];

// Locale used to render language names: the active i18n language unless it is
// "system"/unknown, in which case fall back to English (matches the legacy General rule).
function getActiveLocale(language: string | undefined): SupportedLocale {
  const parsed = parseAppLanguage(language);
  return parsed && parsed !== "system" ? parsed : "en";
}

// Human label for a service-URL open-target value, via the existing settings.general keys.
function serviceUrlBehaviorLabel(t: TFunction, value: ServiceUrlBehavior): string {
  const labels: Record<ServiceUrlBehavior, string> = {
    ask: t("settings.general.serviceUrls.options.ask"),
    "in-app": t("settings.general.serviceUrls.options.inApp"),
    external: t("settings.general.serviceUrls.options.external"),
  };
  return labels[value];
}

// General settings section: renders the four legacy General fields with the codePilot kit
// and dispatches every change straight to useAppSettings().
export function GeneralSection() {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const isDesktopApp = getIsElectron();

  // default-send: a segmented interrupt/queue control whose hint follows the active choice.
  const sendBehaviorOptions = useMemo(
    () => [
      { id: "interrupt" as const, label: t("settings.general.defaultSend.options.interrupt") },
      { id: "queue" as const, label: t("settings.general.defaultSend.options.queue") },
    ],
    [t],
  );
  const sendBehaviorHint =
    settings.sendBehavior === "interrupt"
      ? t("settings.general.defaultSend.descriptions.interrupt")
      : t("settings.general.defaultSend.descriptions.queue");
  const handleSendBehavior = useCallback(
    (sendBehavior: SendBehavior) => {
      void updateSettings({ sendBehavior });
    },
    [updateSettings],
  );

  // language: the trigger shows the resolved label; opening the menu is a dispatcher TODO.
  const activeLocale = getActiveLocale(i18n.language);
  const selectedLanguageOption = LANGUAGE_OPTIONS.find(
    (option) => option.value === settings.language,
  );
  const selectedLanguageLabel = selectedLanguageOption
    ? formatLanguageOptionLabel(
        selectedLanguageOption,
        activeLocale,
        t(selectedLanguageOption.labelKey),
      )
    : settings.language;

  // service URLs (desktop only): same inert-trigger-with-TODO-menu treatment as language.
  const serviceUrlLabel = serviceUrlBehaviorLabel(t, settings.serviceUrlBehavior);

  // TODO(general-section): swap for the real floating picker once the dispatcher wires the
  // dropdown menu host. Until then the trigger announces the pending state rather than
  // silently doing nothing.
  const handlePickerTodo = useCallback(() => {
    Alert.alert("敬请期待", "下拉选择菜单即将接入。");
  }, []);

  // terminal scrollback: editable number; commit on blur/submit, re-sync on external change.
  const [scrollbackText, setScrollbackText] = useState(String(settings.terminalScrollbackLines));
  const handleScrollbackText = useCallback((value: string) => {
    setScrollbackText(value.replace(/[^\d]/g, ""));
  }, []);
  const commitScrollback = useCallback(() => {
    const parsed = parseTerminalScrollbackLines(scrollbackText);
    const next = parsed ?? settings.terminalScrollbackLines;
    setScrollbackText(String(next));
    if (next !== settings.terminalScrollbackLines) {
      void updateSettings({ terminalScrollbackLines: next });
    }
  }, [scrollbackText, settings.terminalScrollbackLines, updateSettings]);
  useEffect(() => {
    setScrollbackText(String(settings.terminalScrollbackLines));
  }, [settings.terminalScrollbackLines]);

  return (
    <SettingsDetail
      title={t("settings.sections.general")}
      subtitle="默认发送行为、应用语言、服务 URL 的打开位置，以及内置终端保留的回滚行数。"
    >
      <SettingsGroup title={t("settings.general.title")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.general.defaultSend.label")}
            description={sendBehaviorHint}
          >
            <SettingsSegmented
              options={sendBehaviorOptions}
              value={settings.sendBehavior}
              onChange={handleSendBehavior}
            />
          </SettingsRow>
          <SettingsRow
            label={t("settings.general.language.label")}
            description={t("settings.general.language.description")}
            divider
          >
            <SettingsSelect label={selectedLanguageLabel} onPress={handlePickerTodo} />
          </SettingsRow>
          {isDesktopApp ? (
            <SettingsRow
              label={t("settings.general.serviceUrls.label")}
              description={t("settings.general.serviceUrls.description")}
              divider
            >
              <SettingsSelect label={serviceUrlLabel} onPress={handlePickerTodo} />
            </SettingsRow>
          ) : null}
          <SettingsRow
            label={t("settings.general.terminalScrollback.label")}
            description={t("settings.general.terminalScrollback.description")}
            divider
          >
            <TextInput
              value={scrollbackText}
              onChangeText={handleScrollbackText}
              onBlur={commitScrollback}
              onSubmitEditing={commitScrollback}
              keyboardType="number-pad"
              inputMode="numeric"
              selectTextOnFocus
              style={SCROLLBACK_INPUT_STYLE}
              accessibilityLabel={t("settings.general.terminalScrollback.accessibilityLabel")}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
    </SettingsDetail>
  );
}
