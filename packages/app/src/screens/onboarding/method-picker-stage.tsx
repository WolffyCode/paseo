import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  ChevronRight,
  ClipboardPaste,
  Link2,
  Network,
  QrCode,
  RefreshCw,
} from "lucide-react-native";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import { codePilotLight } from "@/styles/codepilot-theme";
import { OnboardingBrandMark } from "./onboarding-brand-mark";
import { OnboardingButton } from "./onboarding-button";
import { OnboardingCard } from "./onboarding-card";

type MethodKey = "scan-qr" | "direct-connection" | "paste-pairing-link";

interface ConnectionMethod {
  key: MethodKey;
  title: string;
  description: string;
  testID: string;
  onPress: () => void;
}

export interface MethodPickerStageProps {
  versionLabel: string;
  canRetryLocal: boolean;
  onOpenDirect: () => void;
  onOpenPairLink: () => void;
  onScanQr: () => void;
  onRetryLocal: () => void;
}

const METHOD_ICON = {
  "scan-qr": QrCode,
  "direct-connection": Link2,
  "paste-pairing-link": ClipboardPaste,
} as const;

// Renders the connection-method picker with platform-specific ordering and availability.
export function MethodPickerStage({
  versionLabel,
  canRetryLocal,
  onOpenDirect,
  onOpenPairLink,
  onScanQr,
  onRetryLocal,
}: MethodPickerStageProps) {
  const { t } = useTranslation();
  const methods = useMemo<ConnectionMethod[]>(() => {
    const direct: ConnectionMethod = {
      key: "direct-connection",
      title: t("pairing.connectionMethods.direct.title"),
      description: t("pairing.connectionMethods.direct.description"),
      testID: "onboarding-direct-connection",
      onPress: onOpenDirect,
    };
    const pasteLink: ConnectionMethod = {
      key: "paste-pairing-link",
      title: t("pairing.connectionMethods.pasteLink.title"),
      description: t("pairing.connectionMethods.pasteLink.description"),
      testID: "onboarding-paste-pairing-link",
      onPress: onOpenPairLink,
    };
    const scanQr: ConnectionMethod = {
      key: "scan-qr",
      title: t("pairing.connectionMethods.scanQr.title"),
      description: t("pairing.connectionMethods.scanQr.description"),
      testID: "onboarding-scan-qr",
      onPress: onScanQr,
    };
    if (isWeb && !getIsElectron()) {
      return [direct, pasteLink];
    }
    if (isNative) {
      return [scanQr, pasteLink, direct];
    }
    return [direct, pasteLink, scanQr];
  }, [onOpenDirect, onOpenPairLink, onScanQr, t]);

  return (
    <View style={styles.stage} testID="onboarding-method-picker">
      <OnboardingCard>
        <OnboardingBrandMark icon={Network} size={48} />
        <View style={styles.copyBlock}>
          <Text style={styles.title}>{t("onboarding.picker.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.picker.description")}</Text>
        </View>
        <View style={styles.methods}>
          {methods.map((method, index) => (
            <ConnectionMethodRow key={method.key} method={method} hasTopBorder={index > 0} />
          ))}
        </View>
        {canRetryLocal ? (
          <OnboardingButton
            variant="outline"
            leftIcon={RefreshCw}
            onPress={onRetryLocal}
            testID="onboarding-picker-retry-local"
          >
            {t("onboarding.actions.retryLocal")}
          </OnboardingButton>
        ) : null}
        <Text style={styles.versionLabel}>{versionLabel}</Text>
      </OnboardingCard>
    </View>
  );
}

interface ConnectionMethodRowProps {
  method: ConnectionMethod;
  hasTopBorder: boolean;
}

// Renders one selectable connection method row without owning the connection flow.
// Hover tints its own row (self-contained: no nested Pressables; hover state is read only by this row's style).
function ConnectionMethodRow({ method, hasTopBorder }: ConnectionMethodRowProps) {
  const Icon = METHOD_ICON[method.key];
  const [hovered, setHovered] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const rowStyle = useMemo(
    () => [styles.row, hasTopBorder ? styles.rowBorder : null, hovered ? styles.rowHover : null],
    [hasTopBorder, hovered],
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={method.onPress}
      testID={method.testID}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={rowStyle}
    >
      <View style={styles.rowIcon}>
        <Icon color={codePilotLight.foregroundMuted} size={16} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{method.title}</Text>
        <Text style={styles.rowDescription}>{method.description}</Text>
      </View>
      <ChevronRight color={codePilotLight.foregroundMuted} size={16} />
    </Pressable>
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
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    textAlign: "center",
  },
  subtitle: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    maxWidth: 344,
    lineHeight: 20,
  },
  methods: {
    width: "100%",
    backgroundColor: codePilotLight.surface,
    borderWidth: 1,
    borderColor: codePilotLight.border,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: codePilotLight.border,
  },
  rowHover: {
    backgroundColor: codePilotLight.hoverSurface,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: codePilotLight.muted,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  rowTitle: {
    color: codePilotLight.foreground,
    fontSize: theme.fontSize.sm,
  },
  rowDescription: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  versionLabel: {
    color: codePilotLight.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
}));
