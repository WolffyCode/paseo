import { AlertCircle, ClipboardPaste, Link2, QrCode, RefreshCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[6],
    alignItems: "center",
  },
  card: {
    width: "100%",
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    gap: theme.spacing[3],
    alignItems: "center",
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
  detail: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    gap: theme.spacing[3],
  },
}));

interface OnboardingErrorViewProps {
  message: string | null;
  showScanAction: boolean;
  onRetry: () => void;
  onOpenDirect: () => void;
  onOpenPasteLink: () => void;
  onOpenScan: () => void;
}

/** Contract: Render terminal onboarding failure copy and recovery actions only. */
export function OnboardingErrorView({
  message,
  showScanAction,
  onRetry,
  onOpenDirect,
  onOpenPasteLink,
  onOpenScan,
}: OnboardingErrorViewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.content}>
      <View style={styles.card}>
        <AlertCircle size={24} />
        <Text style={styles.title}>{t("onboarding.error.title")}</Text>
        <Text style={styles.body}>{t("onboarding.error.body")}</Text>
        {message ? <Text style={styles.detail}>{message}</Text> : null}
      </View>

      <View style={styles.actions}>
        <Button variant="default" size="lg" leftIcon={RefreshCw} onPress={onRetry}>
          {t("onboarding.actions.retry")}
        </Button>
        {showScanAction ? (
          <Button variant="secondary" size="lg" leftIcon={QrCode} onPress={onOpenScan}>
            {t("pairing.connectionMethods.scanQr.title")}
          </Button>
        ) : null}
        <Button variant="secondary" size="lg" leftIcon={Link2} onPress={onOpenDirect}>
          {t("pairing.connectionMethods.direct.title")}
        </Button>
        <Button variant="secondary" size="lg" leftIcon={ClipboardPaste} onPress={onOpenPasteLink}>
          {t("pairing.connectionMethods.pasteLink.title")}
        </Button>
      </View>
    </View>
  );
}
