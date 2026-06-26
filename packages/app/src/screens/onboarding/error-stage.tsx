import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { RefreshCw, Stethoscope, TriangleAlert } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

export interface ErrorStageProps {
  reason: string;
  onRetry: () => void;
  onUseOtherMethods: () => void;
  onOpenDiagnostics: () => void;
}

const ThemedTriangleAlert = withUnistyles(TriangleAlert);
const destructiveIconMapping = (theme: Theme) => ({ color: theme.colors.destructive });

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
      <View style={styles.alert}>
        <ThemedTriangleAlert size={18} uniProps={destructiveIconMapping} />
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
        <Button
          variant="default"
          size="md"
          leftIcon={RefreshCw}
          onPress={onRetry}
          testID="onboarding-error-retry-local"
        >
          {t("onboarding.actions.retry")}
        </Button>
        <Button
          variant="outline"
          size="md"
          onPress={onUseOtherMethods}
          testID="onboarding-use-other-methods"
        >
          {t("onboarding.actions.useOtherMethods")}
        </Button>
      </View>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Stethoscope}
        onPress={onOpenDiagnostics}
        testID="onboarding-open-diagnostics"
      >
        {t("onboarding.actions.diagnostics")}
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
    gap: theme.spacing[4],
  },
  alert: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  alertTitle: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  alertDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  reason: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    lineHeight: 18,
  },
  actions: {
    width: "100%",
    maxWidth: 420,
    gap: theme.spacing[3],
  },
}));
