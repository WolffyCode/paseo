import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChromeDialog } from "@/desktop/browser/chrome-dialog";
import { ChromeDialogButton } from "@/desktop/browser/chrome-controls";
import { CHROME_FONT_FAMILY } from "@/desktop/browser/chrome-theme";
import { answerExtensionInstallPrompt } from "./runtime";
import { useBrowserExtensionsStore } from "./store";
import { permissionLines } from "./permission-lines";

// Chrome keeps "Add extension" disabled briefly so a click meant for the page can't accept.
const INSTALL_BUTTON_DELAY_MS = 500;

/**
 * Chrome's "Add extension?" dialog for a Chrome Web Store install started from `browserId`.
 * Cancel is the default answer, as in Chrome.
 */
export function ExtensionInstallPromptDialog({ browserId }: { browserId: string }) {
  const { t } = useTranslation();
  const prompt = useBrowserExtensionsStore(
    (state) => state.installPromptsByBrowserId[browserId] ?? null,
  );
  const [isAddEnabled, setIsAddEnabled] = useState(false);
  const requestId = prompt?.requestId ?? null;

  useEffect(() => {
    setIsAddEnabled(false);
    if (requestId === null) {
      return;
    }
    const timer = setTimeout(() => setIsAddEnabled(true), INSTALL_BUTTON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [requestId]);

  const lines = useMemo(() => (prompt ? permissionLines(t, prompt.permissions) : []), [prompt, t]);
  const handleCancel = useCallback(() => {
    answerExtensionInstallPrompt(browserId, false);
  }, [browserId]);
  const handleAdd = useCallback(() => {
    answerExtensionInstallPrompt(browserId, true);
  }, [browserId]);

  if (!prompt) {
    return null;
  }
  return (
    <ChromeDialog
      title={t("workspace.browser.extensions.install.title", { name: prompt.name })}
      iconUri={prompt.iconDataUrl}
      onEscape={handleCancel}
      testID="browser-extension-install-prompt"
      buttons={
        <>
          <ChromeDialogButton
            variant="tonal"
            label={t("common.actions.cancel")}
            onPress={handleCancel}
            testID="browser-extension-install-cancel"
          />
          <ChromeDialogButton
            variant="prominent"
            label={t("workspace.browser.extensions.install.add")}
            onPress={handleAdd}
            isDisabled={!isAddEnabled}
            testID="browser-extension-install-add"
          />
        </>
      }
    >
      {lines.length > 0 ? (
        <>
          <Text style={styles.body}>
            {t("workspace.browser.extensions.install.permissionsHeading")}
          </Text>
          <View style={styles.permissionList}>
            {lines.map((line) => (
              <View key={line.text} style={styles.permission}>
                <View style={styles.bulletRow}>
                  <Text style={styles.body}>•</Text>
                  <Text style={[styles.body, styles.bulletText]}>{line.text}</Text>
                </View>
                {line.details.map((detail) => (
                  <View key={detail} style={[styles.bulletRow, styles.detailRow]}>
                    <Text style={styles.body}>•</Text>
                    <Text style={[styles.body, styles.bulletText]}>{detail}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ChromeDialog>
  );
}

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    body: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      color: chrome.bubbleTextSecondary,
    },
    permissionList: {
      gap: 4,
    },
    permission: {
      gap: 4,
    },
    bulletRow: {
      flexDirection: "row",
      gap: 8,
    },
    bulletText: {
      flex: 1,
    },
    detailRow: {
      paddingLeft: 16,
    },
  };
});
