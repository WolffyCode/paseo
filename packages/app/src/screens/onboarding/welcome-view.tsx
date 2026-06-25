import { ClipboardPaste, ExternalLink, Link2, QrCode, Settings } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { Button } from "@/components/ui/button";

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[6],
    alignItems: "center",
  },
  copyBlock: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    gap: theme.spacing[3],
  },
  footer: {
    width: "100%",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  setupLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  setupLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));

interface OnboardingWelcomeViewProps {
  showScanAction: boolean;
  showWebsiteLink: boolean;
  onContinue: () => void;
  onOpenDirect: () => void;
  onOpenPasteLink: () => void;
  onOpenScan: () => void;
  onOpenSettings: () => void;
  onOpenWebsite: () => void;
}

/** Contract: Render the first-run welcome CTA cluster without owning onboarding state transitions. */
export function OnboardingWelcomeView({
  showScanAction,
  showWebsiteLink,
  onContinue,
  onOpenDirect,
  onOpenPasteLink,
  onOpenScan,
  onOpenSettings,
  onOpenWebsite,
}: OnboardingWelcomeViewProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();

  return (
    <View style={styles.content}>
      <PaseoLogo size={96} />
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{t("onboarding.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>
        {showWebsiteLink ? (
          <Pressable style={styles.setupLink} onPress={onOpenWebsite}>
            <Text style={styles.setupLinkText}>paseo.sh</Text>
            <ExternalLink size={14} color={theme.colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        {showScanAction ? (
          <Button
            variant="default"
            size="lg"
            leftIcon={QrCode}
            onPress={onOpenScan}
            testID="onboarding-scan-qr"
          >
            {t("pairing.connectionMethods.scanQr.title")}
          </Button>
        ) : null}
        <Button
          variant={showScanAction ? "secondary" : "default"}
          size="lg"
          leftIcon={Link2}
          onPress={onOpenDirect}
          testID="onboarding-direct-connection"
        >
          {t("pairing.connectionMethods.direct.title")}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          leftIcon={ClipboardPaste}
          onPress={onOpenPasteLink}
          testID="onboarding-paste-pairing-link"
        >
          {t("pairing.connectionMethods.pasteLink.title")}
        </Button>
      </View>

      <View style={styles.footer}>
        <Button variant="ghost" size="sm" onPress={onContinue} testID="onboarding-continue">
          {t("onboarding.actions.continue")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={Settings}
          onPress={onOpenSettings}
          testID="onboarding-open-settings"
        >
          {t("onboarding.actions.openSettings")}
        </Button>
      </View>
    </View>
  );
}
