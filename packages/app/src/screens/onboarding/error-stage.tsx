import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { RefreshCw, Stethoscope, TriangleAlert } from "lucide-react-native";
import { codePilotLight } from "@/styles/codepilot-theme";
import { OnboardingButton } from "./onboarding-button";
import { OnboardingCard } from "./onboarding-card";

export interface ErrorStageProps {
  reason: string;
  onRetry: () => void;
  onUseOtherMethods: () => void;
  onOpenDiagnostics: () => void;
}

// Renders the local-daemon failure recovery surface without parsing raw daemon errors.
export function ErrorStage({
  reason,
  onRetry,
  onUseOtherMethods,
  onOpenDiagnostics,
}: ErrorStageProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.stage} testID="onboarding-error">
      <OnboardingCard>
        <View style={styles.alert}>
          <TriangleAlert color={codePilotLight.danger} size={18} />
          <View style={styles.alertCopy}>
            <Text style={styles.alertTitle}>{t("onboarding.error.title")}</Text>
            <Text style={styles.alertDescription}>{t("onboarding.error.description")}</Text>
            {reason ? (
              <Text style={styles.reason} numberOfLines={3}>
                {t("onboarding.error.reasonLabel", { reason })}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actions}>
          <OnboardingButton
            variant="primary"
            leftIcon={RefreshCw}
            onPress={onRetry}
            testID="onboarding-error-retry-local"
          >
            {t("onboarding.actions.retry")}
          </OnboardingButton>
          <OnboardingButton
            variant="outline"
            onPress={onUseOtherMethods}
            testID="onboarding-use-other-methods"
          >
            {t("onboarding.actions.useOtherMethods")}
          </OnboardingButton>
        </View>
        <OnboardingButton
          variant="ghost"
          leftIcon={Stethoscope}
          onPress={onOpenDiagnostics}
          testID="onboarding-open-diagnostics"
        >
          {t("onboarding.actions.diagnostics")}
        </OnboardingButton>
      </OnboardingCard>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stage: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[8],
  },
  alert: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: codePilotLight.dangerSurface,
    borderWidth: 1,
    borderColor: codePilotLight.dangerBorder,
    borderRadius: theme.borderRadius.md,
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  alertTitle: {
    color: codePilotLight.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  alertDescription: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  reason: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    lineHeight: 18,
  },
  actions: {
    width: "100%",
    gap: 10,
  },
}));
