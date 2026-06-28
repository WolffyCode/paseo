// About — app version, release channel + software update (desktop only), and a
// version-compare list of every connected host. Pure re-skin: the data wiring (updater,
// release channel, host versions) is reused unchanged from the legacy About; only the
// presentation moves to the codePilot kit.
import { useCallback, useMemo } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AlertTriangle, Download, RefreshCw, Server, WifiOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useUnistyles } from "react-native-unistyles";
import { desktopUpdateButtonsDisabled } from "@/desktop/updates/desktop-app-updater";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { useDesktopAppUpdater } from "@/desktop/updates/use-desktop-app-updater";
import { useSettings } from "@/hooks/use-settings";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { HostProfile } from "@/types/host-connection";
import { resolveAppVersion } from "@/utils/app-version";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  SettingsBadge,
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsGroup,
  SettingsRow,
  SettingsSegmented,
  SettingsStatusDot,
  SettingsValue,
} from "../primitives";
import { settingsKit } from "../styles";

// Strip a leading "v" so a client "v1.0.0" and a daemon "1.0.0" compare equal.
function normalizeVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^v/i, "");
}

export function AboutSection() {
  const { t } = useTranslation();
  const { isDesktopApp } = useDesktopAppUpdater();
  const appVersion = resolveAppVersion();
  const appVersionText = appVersion ? formatVersionWithPrefix(appVersion) : "—";

  return (
    <SettingsDetail
      title={t("settings.sections.about")}
      subtitle="应用版本、发布通道、软件更新，以及全部已连接主机与本设备的版本对比。"
    >
      <SettingsGroup title={t("settings.about.title")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.about.appVersion")}
            description={t("settings.about.thisDevice")}
          >
            <SettingsValue value={appVersionText} tone="strong" />
          </SettingsRow>
          {isDesktopApp ? <DesktopUpdateRows /> : null}
        </SettingsCard>
      </SettingsGroup>
      <ConnectedHosts clientVersion={appVersion} />
    </SettingsDetail>
  );
}

// Release channel + software-update rows — desktop only (the updater is an Electron
// capability). Auto-checks silently on focus, mirroring the legacy behavior.
function DesktopUpdateRows() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const {
    isDesktopApp,
    statusText,
    availableUpdate,
    errorMessage,
    isChecking,
    isInstalling,
    checkForUpdates,
    installUpdate,
  } = useDesktopAppUpdater();

  useFocusEffect(
    useCallback(() => {
      if (isDesktopApp) {
        void checkForUpdates({ intent: "automatic", silent: true });
      }
      return undefined;
    }, [checkForUpdates, isDesktopApp]),
  );

  const channelOptions = useMemo(
    () => [
      { id: "stable" as const, label: t("settings.about.releaseChannel.stable") },
      { id: "beta" as const, label: t("settings.about.releaseChannel.beta") },
    ],
    [t],
  );
  const handleChannel = useCallback(
    (releaseChannel: "stable" | "beta") => {
      void updateSettings({ releaseChannel });
    },
    [updateSettings],
  );
  const handleCheck = useCallback(() => {
    void checkForUpdates();
  }, [checkForUpdates]);
  const handleInstall = useCallback(() => {
    void confirmDialog({
      title: t("settings.about.updates.installTitle"),
      message: t("settings.about.updates.installMessage"),
      confirmLabel: t("settings.about.updates.installConfirm"),
      cancelLabel: t("common.actions.cancel"),
    })
      .then((confirmed) => {
        if (confirmed) void installUpdate();
        return;
      })
      .catch(() => {
        Alert.alert(
          t("settings.about.updates.alertTitle"),
          t("settings.about.updates.alertMessage"),
        );
      });
  }, [installUpdate, t]);

  const buttons = desktopUpdateButtonsDisabled({ isChecking, isInstalling, availableUpdate });
  const latest = availableUpdate?.latestVersion;
  let updateLabel = t("settings.about.updates.update");
  if (isInstalling) {
    updateLabel = t("settings.about.updates.installing");
  } else if (latest) {
    updateLabel = t("settings.about.updates.updateTo", {
      version: formatVersionWithPrefix(latest),
    });
  }

  const channelBadge = useMemo(() => <SettingsBadge label="桌面专属" />, []);
  const updateDescription = useMemo(
    () => (
      <View>
        <Text style={settingsKit.rowDesc}>{statusText}</Text>
        {latest ? (
          <Text style={settingsKit.rowDesc}>
            {t("settings.about.updates.readyToInstall", {
              version: formatVersionWithPrefix(latest),
            })}
          </Text>
        ) : null}
        {errorMessage ? <Text style={settingsKit.alertDesc}>{errorMessage}</Text> : null}
      </View>
    ),
    [statusText, latest, errorMessage, t],
  );

  return (
    <>
      <SettingsRow
        label={t("settings.about.releaseChannel.label")}
        description={t("settings.about.releaseChannel.description")}
        badge={channelBadge}
        divider
      >
        <SettingsSegmented
          options={channelOptions}
          value={settings.releaseChannel}
          onChange={handleChannel}
        />
      </SettingsRow>
      <SettingsRow
        label={t("settings.about.updates.label")}
        description={updateDescription}
        badge={channelBadge}
        divider
      >
        <SettingsButton
          label={
            isChecking ? t("settings.about.updates.checking") : t("settings.about.updates.check")
          }
          icon={RefreshCw}
          variant="outline"
          small
          onPress={handleCheck}
          disabled={buttons.check}
        />
        <SettingsButton
          label={updateLabel}
          icon={Download}
          variant="primary"
          small
          onPress={handleInstall}
          disabled={buttons.update}
        />
      </SettingsRow>
    </>
  );
}

// The connected-hosts card: one row per host comparing its daemon version to this
// client's. Hidden entirely when no hosts are connected.
function ConnectedHosts({ clientVersion }: { clientVersion: string | null }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  if (hosts.length === 0) {
    return null;
  }
  return (
    <SettingsGroup title={t("settings.about.connectedHosts")}>
      <SettingsCard>
        {hosts.map((host, index) => (
          <HostVersionRow
            key={host.serverId}
            host={host}
            divider={index > 0}
            clientVersion={clientVersion}
          />
        ))}
      </SettingsCard>
    </SettingsGroup>
  );
}

function HostVersionRow({
  host,
  divider,
  clientVersion,
}: {
  host: HostProfile;
  divider: boolean;
  clientVersion: string | null;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const daemonVersion = useSessionStore(
    (state) => state.sessions[host.serverId]?.serverInfo?.version ?? null,
  );

  const normalizedHost = normalizeVersion(daemonVersion);
  const normalizedClient = normalizeVersion(clientVersion);
  const isMismatch =
    normalizedHost !== null && normalizedClient !== null && normalizedHost !== normalizedClient;

  const rowStyle = useMemo(
    () => (divider ? [settingsKit.row, settingsKit.rowDivider] : settingsKit.row),
    [divider],
  );

  let valueText: string;
  let valueTone: "default" | "warn" | "danger";
  if (!isConnected) {
    valueText = t("settings.about.offline");
    valueTone = "danger";
  } else if (normalizedHost) {
    valueText = formatVersionWithPrefix(normalizedHost);
    valueTone = isMismatch ? "warn" : "default";
  } else {
    valueText = "—";
    valueTone = "default";
  }

  return (
    <View style={rowStyle}>
      <View style={settingsKit.rowLeft}>
        <View style={settingsKit.rowLabel}>
          <SettingsStatusDot status={isConnected ? "on" : "off"} />
          {isConnected ? (
            <Server size={14} color={theme.colors.foregroundMuted} />
          ) : (
            <WifiOff size={14} color={theme.colors.foregroundMuted} />
          )}
          <Text style={settingsKit.rowLabelText} numberOfLines={1}>
            {host.label}
          </Text>
        </View>
        {isMismatch ? (
          <Text style={settingsKit.rowDesc}>{t("settings.about.versionDiffers")}</Text>
        ) : null}
      </View>
      <View style={settingsKit.rowControl}>
        {isMismatch ? <SettingsBadge label="不一致" tone="warning" icon={AlertTriangle} /> : null}
        <SettingsValue value={valueText} tone={valueTone} />
      </View>
    </View>
  );
}
