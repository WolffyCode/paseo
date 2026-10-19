import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { CrButton, CrLinkRow } from "@/desktop/browser/webui/controls";
import { CrDialog } from "@/desktop/browser/webui/dialog.electron";
import { WEBUI_LAYOUT } from "@/desktop/browser/webui/theme";
import { CrThrobber } from "@/desktop/browser/webui/throbber";
import { resetBrowserSettings } from "./reset";
import { useSettingsSectionSearch } from "./settings-search";
import { SettingsSection } from "./settings-section";
import { settingsSectionLabel } from "./titles";

// settings-reset-profile-dialog keeps cr-dialog's slots; its body ends 2 dip above the buttons.
const BODY_BOTTOM_PADDING = 2;
const THROBBER_SIZE = 28;

/** settings-reset-page: its one row, which opens the reset dialog. */
export function ResetPage({ onOpenResetDialog }: { onOpenResetDialog: () => void }) {
  const { t } = useTranslation();
  const title = settingsSectionLabel("reset", t);
  const rowLabel = t("workspace.browser.settings.reset.row");
  const isShown = useSettingsSectionSearch("reset", [title, rowLabel]);
  if (!isShown) {
    return null;
  }
  return (
    <SettingsSection title={title} testID="browser-settings-reset">
      <CrLinkRow
        label={rowLabel}
        isExternal={false}
        hasSeparator={false}
        onPress={onOpenResetDialog}
        testID="reset-profile-settings"
      />
    </SettingsSection>
  );
}

/**
 * settings-reset-profile-dialog: what resetting does, then 重置设置. Chrome's footer, which
 * reports the current settings to Google, and its 了解详情 link to Google's help are not part of
 * this browser. No toast follows a reset.
 */
export function ResetProfileDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [isResetting, setIsResetting] = useState(false);
  const reset = useCallback(() => {
    setIsResetting(true);
    resetBrowserSettings()
      .then(() => {
        onClose();
        return undefined;
      })
      .catch((error: unknown) => {
        // The dialog stays open, so resetting can be tried again.
        console.error("[browser-settings] reset failed", error);
        setIsResetting(false);
      });
  }, [onClose]);
  const buttons = (
    <>
      {isResetting ? (
        <View style={styles.throbber}>
          <CrThrobber size={THROBBER_SIZE} />
        </View>
      ) : null}
      <View style={styles.cancel}>
        <CrButton
          label={t("workspace.browser.webui.cancel")}
          isDisabled={isResetting}
          onPress={onClose}
          testID="reset-cancel"
        />
      </View>
      <CrButton
        label={t("workspace.browser.settings.reset.commit")}
        isAction
        isDisabled={isResetting}
        onPress={reset}
        testID="reset-commit"
      />
    </>
  );
  return (
    <CrDialog
      title={t("workspace.browser.settings.reset.title")}
      buttons={buttons}
      onCancel={onClose}
      testID="reset-dialog"
    >
      <View style={styles.body}>
        <Text style={styles.bodyText}>{t("workspace.browser.settings.reset.body.intro")}</Text>
        <View style={styles.paragraphGap} />
        <Text style={styles.bodyText}>{t("workspace.browser.settings.reset.body.resetPages")}</Text>
        <Text style={styles.bodyText}>
          {t("workspace.browser.settings.reset.body.disableExtensions")}
        </Text>
        <Text style={styles.bodyText}>
          {t("workspace.browser.settings.reset.body.deleteCookies")}
        </Text>
        <View style={styles.paragraphGap} />
        <Text style={styles.bodyText}>{t("workspace.browser.settings.reset.body.kept")}</Text>
      </View>
    </CrDialog>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    paddingBottom: BODY_BOTTOM_PADDING,
  },
  bodyText: {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: WEBUI_LAYOUT.fontSize,
    lineHeight: WEBUI_LAYOUT.lineHeight,
    color: theme.webui.textSecondary,
  },
  // The text's <br><br>: an empty line.
  paragraphGap: {
    height: WEBUI_LAYOUT.lineHeight,
  },
  // .spinner: 28 dip with 8 on each side, at the top of the button row.
  throbber: {
    alignSelf: "flex-start",
    marginHorizontal: 8,
  },
  cancel: {
    marginRight: 8,
  },
}));
