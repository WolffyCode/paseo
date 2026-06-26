import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { isNative } from "@/constants/platform";

export interface WelcomeStageProps {
  versionLabel: string;
  onStart: () => void;
  onConnectRemote: () => void;
}

// Styles the self-contained remote link hover without component state or outer hover tracking.
function remoteLinkPressableStyle({
  hovered,
}: PressableStateCallbackType & { hovered?: boolean }): StyleProp<ViewStyle> {
  return [
    styles.remoteLinkPressable,
    hovered && !isNative ? (styles.remoteLinkTextHovered as StyleProp<ViewStyle>) : null,
  ];
}

// Renders the one-time brand welcome while leaving phase transitions to the parent model.
export function WelcomeStage({ versionLabel, onStart, onConnectRemote }: WelcomeStageProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.stage} testID="onboarding-welcome">
      <PaseoLogo size={96} />
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{t("onboarding.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>
      </View>
      <View style={styles.actions}>
        <Button variant="default" size="lg" onPress={onStart} testID="onboarding-start">
          {t("onboarding.actions.start")}
        </Button>
        <Pressable
          accessibilityRole="link"
          onPress={onConnectRemote}
          style={remoteLinkPressableStyle}
          testID="onboarding-connect-remote"
        >
          <Text style={styles.remoteLinkText}>{t("onboarding.actions.connectRemote")}</Text>
        </Pressable>
      </View>
      <Text style={styles.versionLabel}>{versionLabel}</Text>
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
    gap: theme.spacing[6],
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
    maxWidth: 420,
    lineHeight: 20,
  },
  actions: {
    width: "100%",
    maxWidth: 360,
    gap: theme.spacing[3],
  },
  remoteLinkPressable: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  remoteLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  remoteLinkTextHovered: {
    textDecorationLine: "underline",
  },
  versionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
    marginTop: theme.spacing[2],
  },
}));
