import { useTranslation } from "react-i18next";
import { CrLinkRow } from "@/desktop/browser/webui/controls";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

/**
 * settings-privacy-page with the one row this browser backs. Chrome's 安全检查, 第三方 Cookie,
 * 安全 and 网站设置 need Safe Browsing and per-site settings it doesn't have.
 */
export function PrivacyPage({ onOpenClearBrowsingData }: { onOpenClearBrowsingData: () => void }) {
  const { t } = useTranslation();
  const title = settingsSectionLabel("privacy", t);
  const rowLabel = t("workspace.browser.clearData.title");
  const rowSubLabel = t("workspace.browser.settings.privacy.clearBrowsingDataDescription");
  const isShown = useSettingsSectionSearch("privacy", [title, rowLabel, rowSubLabel]);
  if (!isShown) {
    return null;
  }
  return (
    <SettingsSection title={title} testID="browser-settings-privacy">
      <CrLinkRow
        startIcon="settingsDelete"
        label={rowLabel}
        subLabel={rowSubLabel}
        isExternal={false}
        hasSeparator={false}
        onPress={onOpenClearBrowsingData}
        testID="browser-settings-clear-browsing-data"
      />
    </SettingsSection>
  );
}
