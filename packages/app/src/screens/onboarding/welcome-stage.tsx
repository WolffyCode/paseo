import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Gauge } from "lucide-react-native";
import { codePilotLight } from "@/styles/codepilot-theme";
import { OnboardingBrandMark } from "./onboarding-brand-mark";
import { OnboardingButton, OnboardingLink } from "./onboarding-button";
import { OnboardingCard } from "./onboarding-card";

export interface WelcomeStageProps {
  versionLabel: string;
  onStart: () => void;
  onConnectRemote: () => void;
}

// Renders the one-time brand welcome while leaving phase transitions to the parent model.
export function WelcomeStage({ versionLabel, onStart, onConnectRemote }: WelcomeStageProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.stage} testID="onboarding-welcome">
      <OnboardingCard>
        <OnboardingBrandMark icon={Gauge} size={60} />
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{t("onboarding.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>
        </View>
        <View style={styles.actions}>
          <OnboardingButton variant="primary" onPress={onStart} testID="onboarding-start">
            {t("onboarding.actions.start")}
          </OnboardingButton>
          <OnboardingLink onPress={onConnectRemote} testID="onboarding-connect-remote">
            {t("onboarding.actions.connectRemote")}
          </OnboardingLink>
        </View>
        <Text style={styles.versionLabel}>{versionLabel}</Text>
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
  copyBlock: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    color: codePilotLight.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center",
  },
  subtitle: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    maxWidth: 344,
    lineHeight: 22,
  },
  actions: {
    width: "100%",
    maxWidth: 344,
    alignItems: "center",
    gap: 10,
  },
  versionLabel: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
}));
