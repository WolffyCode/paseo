import { LoaderCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { StartupBlocker, StartupRegistryStatus } from "@/app/host-runtime-bootstrap";
import { PaseoLogo } from "@/components/icons/paseo-logo";

const styles = StyleSheet.create((theme) => ({
  content: {
    alignItems: "center",
    gap: theme.spacing[6],
  },
  card: {
    width: "100%",
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    alignItems: "center",
    gap: theme.spacing[3],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  body: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));

interface OnboardingConnectingViewProps {
  anyOnlineHostServerId: string | null;
  hostRegistryStatus: StartupRegistryStatus;
  startupBlocker: StartupBlocker;
  statusLabel: string;
}

/** Contract: Show non-terminal onboarding waiting states without mutating navigation. */
export function OnboardingConnectingView({
  anyOnlineHostServerId,
  hostRegistryStatus,
  startupBlocker,
  statusLabel,
}: OnboardingConnectingViewProps) {
  const { t } = useTranslation();
  let body = t("onboarding.connecting.searching");
  if (startupBlocker.kind === "managed-daemon-starting") {
    body = t("onboarding.connecting.managedDaemon");
  } else if (hostRegistryStatus === "loading") {
    body = t("onboarding.connecting.loadingHosts");
  } else if (anyOnlineHostServerId) {
    body = t("onboarding.connecting.foundHost");
  }

  return (
    <View style={styles.content}>
      <PaseoLogo size={96} />
      <View style={styles.card}>
        <LoaderCircle size={24} />
        <Text style={styles.title}>{statusLabel}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}
