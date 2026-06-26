import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  ChevronRight,
  ClipboardPaste,
  Link2,
  QrCode,
  RefreshCw,
  Network,
} from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";

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

const ThemedNetwork = withUnistyles(Network);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedQrCode = withUnistyles(QrCode);
const ThemedLink2 = withUnistyles(Link2);
const ThemedClipboardPaste = withUnistyles(ClipboardPaste);
const foregroundMutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const accentIconMapping = (theme: Theme) => ({ color: theme.colors.accent });

const METHOD_ICON = {
  "scan-qr": ThemedQrCode,
  "direct-connection": ThemedLink2,
  "paste-pairing-link": ThemedClipboardPaste,
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
      <View style={styles.badgeIcon}>
        <ThemedNetwork size={24} uniProps={accentIconMapping} />
      </View>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{t("onboarding.picker.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.picker.description")}</Text>
      </View>
      <View style={styles.card}>
        {methods.map((method, index) => (
          <ConnectionMethodRow key={method.key} method={method} hasTopBorder={index > 0} />
        ))}
      </View>
      {canRetryLocal ? (
        <Button
          variant="outline"
          size="md"
          leftIcon={RefreshCw}
          onPress={onRetryLocal}
          style={styles.retryButton}
          testID="onboarding-picker-retry-local"
        >
          {t("onboarding.actions.retryLocal")}
        </Button>
      ) : null}
      <Text style={styles.versionLabel}>{versionLabel}</Text>
    </View>
  );
}

interface ConnectionMethodRowProps {
  method: ConnectionMethod;
  hasTopBorder: boolean;
}

// Renders one selectable connection method row without owning the connection flow.
function ConnectionMethodRow({ method, hasTopBorder }: ConnectionMethodRowProps) {
  const Icon = METHOD_ICON[method.key];
  const rowStyle = useMemo(
    () => [styles.row, hasTopBorder ? styles.rowBorder : null],
    [hasTopBorder],
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={method.onPress}
      style={rowStyle}
      testID={method.testID}
    >
      <View style={styles.rowIcon}>
        <Icon size={16} uniProps={accentIconMapping} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{method.title}</Text>
        <Text style={styles.rowDescription}>{method.description}</Text>
      </View>
      <ThemedChevronRight size={16} uniProps={foregroundMutedIconMapping} />
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
    gap: theme.spacing[4],
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
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
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    maxWidth: 420,
    lineHeight: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  rowDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  retryButton: {
    width: "100%",
    maxWidth: 420,
  },
  versionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
    marginTop: theme.spacing[1],
  },
}));
