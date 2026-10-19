import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { BROWSER_START_URL, openBrowserStartPage } from "@/desktop/browser/start-page";
import { useDefaultSearchEngine } from "@/desktop/browser/search-engines";

interface BrowserPaneProps {
  browserId: string;
  serverId: string;
  workspaceId: string;
  cwd: string | null;
  isInteractive?: boolean;
  onFocusPane?: () => void;
  focusAddressOnMount?: boolean;
}

export function BrowserPane({ browserId }: BrowserPaneProps) {
  const { t } = useTranslation();
  const engineName = useDefaultSearchEngine().name;
  const { theme } = useUnistyles();
  const [page] = useState(() => openBrowserStartPage({ browserId, url: BROWSER_START_URL }));
  const snapshot = useSyncExternalStore(page.subscribe, page.getSnapshot, page.getSnapshot);
  const [submitted, setSubmitted] = useState(false);
  const inputStyle = useMemo(
    () => [styles.input, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const submitDraft = useCallback(() => {
    const intent = page.submitDraft();
    setSubmitted(intent?.kind === "load");
  }, [page]);

  return (
    <View style={styles.container}>
      <View style={styles.addressRow}>
        <TextInput
          accessibilityLabel={t("workspace.browser.controls.browserUrl")}
          autoCapitalize="none"
          autoCorrect={false}
          initialValue={snapshot.draft}
          onChangeText={page.editDraft}
          onSubmitEditing={submitDraft}
          placeholder={t("workspace.browser.omnibox.placeholder", { engine: engineName })}
          placeholderTextColor={theme.colors.foregroundMuted}
          style={inputStyle}
        />
      </View>
      {snapshot.phase === "start" ? (
        <View style={styles.surface} testID={`browser-start-${browserId}`} />
      ) : null}
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
  container: { flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 },
  addressRow: { height: 48, justifyContent: "center", paddingHorizontal: theme.spacing[2] },
  input: {
    height: 28,
    borderRadius: 10,
    paddingHorizontal: theme.spacing[2],
    backgroundColor: "transparent",
    fontSize: theme.fontSize.base,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  surface: { flex: 1, backgroundColor: theme.colors.surface1 },
  notice: { alignItems: "center", gap: theme.spacing[2], padding: theme.spacing[4] },
  title: { fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.medium },
  subtitle: { fontSize: theme.fontSize.sm },
}));
