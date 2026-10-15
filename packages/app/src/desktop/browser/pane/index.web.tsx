import { useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
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
  const titleStyle = useMemo(
    () => [styles.title, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  const subtitleStyle = useMemo(
    () => [styles.subtitle, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  if (snapshot.phase === "start") return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <Text style={titleStyle}>{t("workspace.browser.unavailable.title")}</Text>
      <Text style={subtitleStyle}>{t("workspace.browser.unavailable.subtitle")}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
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
