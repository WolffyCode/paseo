// Host → Connections — the list of ways this client reaches one host (local / relay /
// TCP), with live latency, online/preferred badges and per-row removal, plus the
// local-daemon pairing entry. Pure re-skin onto the codePilot kit: the data wiring
// (host lookup, runtime snapshot, removeConnection mutation, pairing modal) is reused
// unchanged from the legacy HostConnectionsPage; only the presentation moves to the kit.
import { useCallback, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Globe, Monitor, QrCode, Trash2, WifiOff } from "lucide-react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useUnistyles } from "react-native-unistyles";
import { PairDeviceModal } from "@/desktop/components/pair-device-modal";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { useHostMutations, useHostRuntimeSnapshot, useHosts } from "@/runtime/host-runtime";
import type { HostConnection, HostProfile } from "@/types/host-connection";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { ConnectionProbeState } from "@/utils/connection-selection";
import { formatLatency } from "@/utils/latency";
import {
  SettingsAlert,
  SettingsBadge,
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsStatusDot,
  SettingsValue,
} from "../primitives";
import { settingsKit } from "../styles";

const SUBTITLE =
  "查看并管理连到这台主机的连接方式（本地直连 / 远程中继 / TCP）；系统按延迟自动择优，可逐条移除。";

// A shared empty map so a host with no live snapshot doesn't allocate a fresh Map per render.
const EMPTY_PROBE_MAP = new Map<string, ConnectionProbeState>();

// Build the human label for one connection — type tag + its address — matching the
// legacy connections list ("Relay (…)", "Local (…)", "TCP (…)").
function formatHostConnectionLabel(connection: HostConnection, t: TFunction): string {
  if (connection.type === "relay") {
    return `${t("settings.host.badges.relay")} (${connection.relayEndpoint})`;
  }
  if (connection.type === "directSocket" || connection.type === "directPipe") {
    return `${t("settings.host.badges.local")} (${connection.path})`;
  }
  return `TCP (${connection.endpoint})`;
}

// The Host → Connections detail pane. Looks up the host and gates the pairing entry to
// the local daemon, exactly like the legacy HostConnectionsPage.
export function HostConnectionsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const host = hosts.find((entry) => entry.serverId === serverId) ?? null;

  if (!host) {
    return (
      <SettingsDetail title={t("settings.hostSections.connections")} subtitle={SUBTITLE}>
        <SettingsEmpty message={t("settings.host.notFound")} />
      </SettingsDetail>
    );
  }

  return (
    <SettingsDetail title={t("settings.hostSections.connections")} subtitle={SUBTITLE}>
      <ConnectionError serverId={serverId} />
      <ConnectionsCard host={host} />
      {isLocalDaemon ? <PairDevices /> : null}
    </SettingsDetail>
  );
}

// Surfaces the runtime's last connection error for this host; renders nothing when clear.
function ConnectionError({ serverId }: { serverId: string }) {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const lastError = snapshot?.lastError ?? null;
  const message =
    typeof lastError === "string" && lastError.trim().length > 0 ? lastError.trim() : null;
  if (!message) {
    return null;
  }
  // TODO(i18n): the callout title is hardcoded — there's no connection-error heading key yet.
  return <SettingsAlert tone="error" icon={WifiOff} title="连接错误" description={message} />;
}

// The connections list card. Owns the removeConnection dispatch (native confirm → mutation
// → error alert) and feeds each row its derived status/latency from the runtime snapshot.
function ConnectionsCard({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const { removeConnection } = useHostMutations();
  const snapshot = useHostRuntimeSnapshot(host.serverId);
  const probeByConnectionId = snapshot?.probeByConnectionId ?? EMPTY_PROBE_MAP;
  const activeConnectionId = snapshot?.activeConnectionId ?? null;
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";

  const handleRemove = useCallback(
    (connection: HostConnection) => {
      const name = formatHostConnectionLabel(connection, t);
      void confirmDialog({
        title: t("settings.host.connections.removeTitle"),
        message: t("settings.host.connections.removeMessage", { name }),
        confirmLabel: t("settings.host.connections.removeAction"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      })
        .then((confirmed) =>
          confirmed ? removeConnection(host.serverId, connection.id) : undefined,
        )
        .catch((error) => {
          console.error("[HostConnectionsSection] Failed to remove connection", error);
          Alert.alert(
            t("settings.host.connections.removeErrorTitle"),
            t("settings.host.connections.removeErrorMessage"),
          );
        });
    },
    [host.serverId, removeConnection, t],
  );

  return (
    <SettingsGroup title={t("settings.host.connections.title")}>
      <SettingsCard>
        {host.connections.map((connection, index) => {
          const probe = probeByConnectionId.get(connection.id);
          const isOnline = connection.id === activeConnectionId && connectionStatus === "online";
          return (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              divider={index > 0}
              isOnline={isOnline}
              isPreferred={connection.id === host.preferredConnectionId}
              latencyMs={probe?.status === "available" ? probe.latencyMs : null}
              latencyLoading={!probe || probe.status === "pending"}
              latencyError={probe?.status === "unavailable"}
              onRemove={handleRemove}
            />
          );
        })}
      </SettingsCard>
    </SettingsGroup>
  );
}

// One connection row: status dot + type icon + address on the left; online/preferred
// badges, live latency and a Remove button on the right. Derives every visual from props
// so the list item never builds fresh objects in JSX.
function ConnectionRow({
  connection,
  divider,
  isOnline,
  isPreferred,
  latencyMs,
  latencyLoading,
  latencyError,
  onRemove,
}: {
  connection: HostConnection;
  divider: boolean;
  isOnline: boolean;
  isPreferred: boolean;
  latencyMs: number | null;
  latencyLoading: boolean;
  latencyError: boolean;
  onRemove: (connection: HostConnection) => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const label = formatHostConnectionLabel(connection, t);

  const handleRemove = useCallback(() => onRemove(connection), [onRemove, connection]);

  const rowStyle = useMemo(
    () => (divider ? [settingsKit.row, settingsKit.rowDivider] : settingsKit.row),
    [divider],
  );

  let dotStatus: "on" | "off" | "idle";
  if (isOnline) {
    dotStatus = "on";
  } else if (latencyError) {
    dotStatus = "off";
  } else {
    dotStatus = "idle";
  }

  let latencyText: string;
  if (latencyLoading) {
    latencyText = "...";
  } else if (latencyError) {
    latencyText = t("settings.host.connections.timeout");
  } else if (latencyMs != null) {
    latencyText = formatLatency(latencyMs);
  } else {
    latencyText = "—";
  }
  const latencyTone = latencyError ? "danger" : "default";

  const TypeIcon = connection.type === "relay" ? Globe : Monitor;

  return (
    <View style={rowStyle}>
      <View style={settingsKit.rowLeft}>
        <View style={settingsKit.rowLabel}>
          <SettingsStatusDot status={dotStatus} />
          <TypeIcon size={14} color={theme.colors.foregroundMuted} />
          <Text style={settingsKit.rowLabelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
      <View style={settingsKit.rowControl}>
        {isOnline ? <SettingsBadge label="在线" tone="success" /> : null}
        {isPreferred ? <SettingsBadge label="首选" /> : null}
        <SettingsValue value={latencyText} tone={latencyTone} />
        <SettingsButton
          label={t("settings.host.connections.removeAction")}
          icon={Trash2}
          variant="danger"
          small
          onPress={handleRemove}
        />
      </View>
    </View>
  );
}

// The local-daemon pairing entry — a row that opens the existing PairDeviceModal (QR /
// link). Only mounted for the local daemon, matching the legacy HostConnectionsPage gate.
function PairDevices() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <SettingsGroup title={t("settings.host.pairDevices.title")}>
      <SettingsCard>
        <SettingsRow
          label={t("settings.host.pairDevices.rowTitle")}
          description={t("settings.host.pairDevices.rowHint")}
        >
          {/* TODO(i18n): button label hardcoded — there's no pairing-action key yet. */}
          <SettingsButton label="显示二维码 / 链接" icon={QrCode} small onPress={handleOpen} />
        </SettingsRow>
      </SettingsCard>
      <PairDeviceModal
        visible={isOpen}
        onClose={handleClose}
        testID="host-connections-pair-modal"
      />
    </SettingsGroup>
  );
}
