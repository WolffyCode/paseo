import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { BROWSER_START_URL, openBrowserStartPage } from "@/desktop/browser/start-page";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
}

export function BrowserPane({ browserId }: BrowserPaneProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [page] = useState(() => openBrowserStartPage({ browserId, url: BROWSER_START_URL }));
  const snapshot = useSyncExternalStore(page.subscribe, page.getSnapshot, page.getSnapshot);
  const [submitted, setSubmitted] = useState(false);
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const submitDraft = useCallback(() => {
    const intent = page.submitDraft();
    setSubmitted(intent?.kind === "load");
  }, [page]);

  return (
    <View style={styles.container}>
      <TextInput
        accessibilityLabel={t("workspace.browser.controls.browserUrl")}
        autoCapitalize="none"
        autoCorrect={false}
        initialValue={snapshot.draft}
        onChangeText={page.editDraft}
        onSubmitEditing={submitDraft}
        placeholder={t("workspace.browser.controls.enterUrl")}
        placeholderTextColor={theme.colors.foregroundMuted}
        style={inputStyle}
      />
      {snapshot.phase === "start" ? <View style={styles.surface} /> : null}
      {submitted ? (
        <View style={styles.notice}>
          <Text style={titleStyle}>{t("workspace.browser.unavailable.title")}</Text>
          <Text style={subtitleStyle}>{t("workspace.browser.unavailable.subtitle")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  input: {
    height: 36,
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: theme.fontSize.sm,
  },
  surface: {
    flex: 1,
  },
  notice: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: theme.fontSize.sm,
  },
}));
