import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { codePilotLight } from "@/styles/codepilot-theme";
import { OnboardingButton } from "./onboarding-button";
import { OnboardingCard } from "./onboarding-card";

export interface ConnectingStageProps {
  onCancel: () => void;
}

// Drives the codePilot ring spinner (grey track + blue cap) with a looping native-driver rotation.
// Ring colors/size are fixed codePilot values held in a plain RN StyleSheet so the animated node
// never mixes Unistyles' shadow-tree proxy with the rotation transform.
function ConnectingSpinner() {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);
  const animatedStyle = useMemo(
    () => [
      spinnerStyles.ring,
      {
        transform: [
          { rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        ],
      },
    ],
    [rotation],
  );
  return <Animated.View style={animatedStyle} />;
}

// Renders the local-daemon connection progress surface with only a cancel dispatch.
export function ConnectingStage({ onCancel }: ConnectingStageProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.stage} testID="onboarding-connecting">
      <OnboardingCard>
        <ConnectingSpinner />
        <Text style={styles.title}>{t("onboarding.connecting.title")}</Text>
        <OnboardingButton variant="ghost" onPress={onCancel} testID="onboarding-cancel-local">
          {t("onboarding.actions.cancel")}
        </OnboardingButton>
      </OnboardingCard>
    </View>
  );
}

const spinnerStyles = RNStyleSheet.create({
  ring: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    borderWidth: 3,
    borderColor: codePilotLight.muted,
    borderTopColor: codePilotLight.primary,
  },
});

const styles = StyleSheet.create((theme) => ({
  stage: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[8],
  },
  title: {
    color: codePilotLight.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.normal,
    textAlign: "center",
  },
}));
