import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

export interface ConnectingStageProps {
  onCancel: () => void;
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const accentSpinnerMapping = (theme: Theme) => ({ color: theme.colors.accent });

// Renders the local-daemon connection progress surface with only a cancel dispatch.
export function ConnectingStage({ onCancel }: ConnectingStageProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.stage} testID="onboarding-connecting">
      <ThemedActivityIndicator size="large" uniProps={accentSpinnerMapping} />
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{t("onboarding.connecting.title")}</Text>
      </View>
      <Button variant="ghost" size="sm" onPress={onCancel} testID="onboarding-cancel-local">
        {t("onboarding.actions.cancel")}
      </Button>
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
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.normal,
    textAlign: "center",
  },
}));
