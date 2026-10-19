import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useDownloadSettings } from "@/desktop/browser/downloads/settings";
import { CrButton } from "@/desktop/browser/webui/controls";
import { SettingsRow, SettingsRowSeparator, SettingsToggleButton } from "./settings-rows";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

/**
 * settings-downloads-page: where downloads go, whether each asks first, and whether finished
 * downloads open the partial view. Shown once the main process has answered.
 */
export function DownloadsPage() {
  const { t } = useTranslation();
  const { settings, chooseDirectory, setToggle } = useDownloadSettings();
  const setPromptForDownload = useCallback(
    (isOn: boolean) => setToggle("promptForDownload", isOn),
    [setToggle],
  );
  const setPartialViewEnabled = useCallback(
    (isOn: boolean) => setToggle("partialViewEnabled", isOn),
    [setToggle],
  );
  const title = settingsSectionLabel("downloads", t);
  const locationLabel = t("workspace.browser.settings.downloads.location");
  const promptLabel = t("workspace.browser.settings.downloads.promptForDownload");
  const partialViewLabel = t("workspace.browser.settings.downloads.showWhenFinished");
  const isShown = useSettingsSectionSearch("downloads", [
    title,
    locationLabel,
    settings?.directory ?? "",
    promptLabel,
    partialViewLabel,
  ]);
  if (!settings || !isShown) {
    return null;
  }
  return (
    <SettingsSection title={title} testID="browser-settings-downloads">
      <SettingsRow label={locationLabel} subLabel={settings.directory} hasSeparator={false}>
        <SettingsRowSeparator />
        <CrButton
          label={t("workspace.browser.settings.change")}
          onPress={chooseDirectory}
          testID="downloads-change-directory"
        />
      </SettingsRow>
      <SettingsToggleButton
        label={promptLabel}
        isOn={settings.promptForDownload}
        onChange={setPromptForDownload}
        testID="downloads-prompt-toggle"
      />
      <SettingsToggleButton
        label={partialViewLabel}
        isOn={settings.partialViewEnabled}
        onChange={setPartialViewEnabled}
        testID="downloads-partial-view-toggle"
      />
    </SettingsSection>
  );
}
