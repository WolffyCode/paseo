import { ChevronRight, ClipboardPaste, Link2, QrCode } from "lucide-react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { HostProfile } from "@/types/host-connection";

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[6],
  },
  copyBlock: {
    gap: theme.spacing[2],
    alignItems: "center",
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
  hostList: {
    gap: theme.spacing[3],
  },
  hostButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hostTextWrap: {
    flex: 1,
    gap: theme.spacing[1],
  },
  hostLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  hostMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    gap: theme.spacing[3],
  },
}));

interface OnboardingHostPickerViewProps {
  hosts: HostProfile[];
  showScanAction: boolean;
  onOpenHost: (serverId: string) => void;
  onOpenDirect: () => void;
  onOpenPasteLink: () => void;
  onOpenScan: () => void;
}

/** Contract: Render saved-host choices and fallback pairing actions for post-welcome onboarding. */
export function OnboardingHostPickerView({
  hosts,
  showScanAction,
  onOpenHost,
  onOpenDirect,
  onOpenPasteLink,
  onOpenScan,
}: OnboardingHostPickerViewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.content}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{t("onboarding.picker.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.picker.subtitle")}</Text>
      </View>

      <View style={styles.hostList}>
        {hosts.map((host) => (
          <HostPickerRow key={host.serverId} host={host} onOpenHost={onOpenHost} />
        ))}
      </View>

      <View style={styles.actions}>
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

interface HostPickerRowProps {
  host: HostProfile;
  onOpenHost: (serverId: string) => void;
}

/** Contract: Render one saved-host row and dispatch selection without owning picker state. */
function HostPickerRow({ host, onOpenHost }: HostPickerRowProps) {
  const handlePress = useCallback(() => {
    onOpenHost(host.serverId);
  }, [host.serverId, onOpenHost]);

  return (
    <Pressable
      style={styles.hostButton}
      onPress={handlePress}
      testID={`onboarding-host-${host.serverId}`}
    >
      <View style={styles.hostTextWrap}>
        <Text style={styles.hostLabel} numberOfLines={1}>
          {host.label}
        </Text>
        <Text style={styles.hostMeta} numberOfLines={1}>
          {host.serverId}
        </Text>
      </View>
      <ChevronRight size={18} />
    </Pressable>
  );
}
