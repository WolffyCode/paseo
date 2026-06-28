// Host → Host — the selected host's identity (name + rename + connection status),
// the local built-in daemon card (status / data dir / logs / full status, desktop-only),
// the config.json (cfg1) editor, plus pairing and host removal. Pure re-skin onto the
// codePilot kit: every action reuses the legacy wiring unchanged (renameHost / removeHost
// mutations, the host runtime client's restartServer + read/writeHostConfig, the desktop
// daemon-status hook + toggles, validateHostConfigText). Components only render + dispatch.
//
// Deliberately NOT built here (no real client wiring exists; honest over fake UI):
//  - "远程访问" (relay enable) has no typed MutableDaemonConfigPatch field — relay enable +
//    endpoint live in config.json (`daemon.relay`), exactly where design hm1 "高级" routes
//    them, and the embedded cfg1 editor below edits them. We surface pairing (real) only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Activity,
  Check,
  Copy,
  FileText,
  Pencil,
  QrCode,
  RefreshCw,
  RotateCw,
  Sliders,
  Trash2,
  WifiOff,
} from "lucide-react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { HostConfigRevision } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { isNative } from "@/constants/platform";
import { PairDeviceModal } from "@/desktop/components/pair-device-modal";
import {
  getCliDaemonStatus,
  shouldUseDesktopDaemon,
  startDesktopDaemon,
  stopDesktopDaemon,
} from "@/desktop/daemon/desktop-daemon";
import { useBuiltInDaemonManagement } from "@/desktop/hooks/use-built-in-daemon-management";
import { useDaemonStatus } from "@/desktop/hooks/use-daemon-status";
import { useDesktopSettings, type DesktopSettings } from "@/desktop/settings/desktop-settings";
import { isVersionMismatch } from "@/desktop/updates/desktop-updates";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { validateHostConfigText } from "@/providers/host-config-text";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
  useHostMutations,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHostRuntimeSnapshot,
  useHosts,
} from "@/runtime/host-runtime";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import type { HostProfile } from "@/types/host-connection";
import { resolveAppVersion } from "@/utils/app-version";
import { confirmDialog } from "@/utils/confirm-dialog";
import { formatConnectionStatus, getConnectionStatusTone } from "@/utils/daemons";
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
  SettingsToggle,
  SettingsValue,
} from "../primitives";
import { settingsKit } from "../styles";

type DesktopDaemonSettings = DesktopSettings["daemon"];

const SUBTITLE =
  "这台主机的身份与后台服务：名称 / 连接状态 / 重命名、内建守护进程（仅本机桌面）、config.json 编辑器（界面没暴露的高级项都能在此改）、配对与移除主机。";

const LOGS_MODAL_SNAP_POINTS = ["70%", "92%"];
const STATUS_MODAL_SNAP_POINTS = ["60%", "85%"];

// Map a live connection status onto the kit's three-color dot.
function connectionDotStatus(status: string): "on" | "off" | "idle" {
  if (status === "online") return "on";
  if (status === "offline" || status === "error") return "off";
  return "idle";
}

// Human label for the active connection (local / relay / its raw display), mirroring the
// legacy host-page badge. Returns null when no connection is active yet.
function connectionTypeLabel(
  activeConnection: { type: string; display: string } | null,
  t: TFunction,
): string | null {
  if (!activeConnection) return null;
  if (activeConnection.type === "relay") return t("settings.host.badges.relay");
  if (activeConnection.type === "directSocket" || activeConnection.type === "directPipe") {
    return t("settings.host.badges.local");
  }
  return activeConnection.display;
}

// cfg1 validation → editor badge (label + tone). Early-returns avoid a nested ternary.
function describeEditorBadge(validation: ReturnType<typeof validateHostConfigText> | null): {
  label: string;
  tone: "muted" | "success" | "error";
} {
  if (validation === null) return { label: "加载中…", tone: "muted" };
  if (validation.status === "valid") return { label: "JSON 有效", tone: "success" };
  const label = validation.error?.line ? `JSON 无效 · 第 ${validation.error.line} 行` : "JSON 无效";
  return { label, tone: "error" };
}

// The Host detail pane. Looks up the selected host; everything below is reused legacy wiring.
export function HostSettingsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const host = hosts.find((entry) => entry.serverId === serverId) ?? null;

  if (!host) {
    return (
      <SettingsDetail title={t("settings.hostSections.host")} subtitle={SUBTITLE}>
        <SettingsEmpty message={t("settings.host.notFound")} />
      </SettingsDetail>
    );
  }

  return (
    <SettingsDetail title={t("settings.hostSections.host")} subtitle={SUBTITLE}>
      <OfflineNotice serverId={serverId} />
      <IdentityGroup host={host} />
      <ConnectionStatusGroup serverId={serverId} />
      <CommonGroup host={host} isLocalDaemon={isLocalDaemon} />
      <LocalDaemonCard />
      <HostConfigEditorGroup serverId={serverId} />
      <RemoveHostGroup host={host} isLocalDaemon={isLocalDaemon} />
    </SettingsDetail>
  );
}

// Surfaces an offline banner with the runtime's last error; renders nothing while online.
function OfflineNotice({ serverId }: { serverId: string }) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const snapshot = useHostRuntimeSnapshot(serverId);
  if (isConnected) {
    return null;
  }
  const lastError =
    typeof snapshot?.lastError === "string" && snapshot.lastError.trim().length > 0
      ? snapshot.lastError.trim()
      : "连接不上这台主机的后台服务。下面是缓存信息，重新连上后才能修改（重命名仍可用）。";
  // TODO(i18n): offline banner copy is hardcoded — no callout keys exist yet.
  return <SettingsAlert tone="error" icon={WifiOff} title="主机离线" description={lastError} />;
}

// Identity card: host name + online/offline badge + daemon version, with the rename action.
function IdentityGroup({ host }: { host: HostProfile }) {
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const daemonVersion = useSessionStore(
    (state) => state.sessions[host.serverId]?.serverInfo?.version ?? null,
  );

  const stateBadge = useMemo(
    () =>
      isConnected ? (
        <SettingsBadge label="在线" tone="success" />
      ) : (
        <SettingsBadge label="离线" tone="error" />
      ),
    [isConnected],
  );
  const description = daemonVersion
    ? `这台主机的后台服务 · v${daemonVersion}`
    : "这台主机的后台服务";
  const renameButton = useMemo(() => <RenameButton host={host} />, [host]);

  return (
    <SettingsGroup>
      <SettingsCard>
        <SettingsRow label={host.label} badge={stateBadge} description={description}>
          {renameButton}
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>
  );
}

// Rename control — reuses renameHost + AdaptiveRenameModal (legacy HostRenameButton wiring),
// re-skinned as a kit button.
function RenameButton({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const { renameHost } = useHostMutations();
  const [isEditing, setIsEditing] = useState(false);

  const handleOpen = useCallback(() => setIsEditing(true), []);
  const handleClose = useCallback(() => setIsEditing(false), []);
  const handleSubmit = useCallback(
    async (value: string) => {
      const next = value.trim();
      if (next === host.label.trim()) return;
      await renameHost(host.serverId, next);
    },
    [host.label, host.serverId, renameHost],
  );

  return (
    <>
      {/* TODO(i18n): button label hardcoded — no rename-action key, only the a11y editLabel. */}
      <SettingsButton label="重命名" icon={Pencil} variant="outline" small onPress={handleOpen} />
      <AdaptiveRenameModal
        visible={isEditing}
        title={t("settings.host.daemon.rename.title")}
        initialValue={host.label}
        placeholder={t("settings.host.daemon.rename.placeholder")}
        submitLabel={t("settings.host.daemon.rename.submit")}
        onClose={handleClose}
        onSubmit={handleSubmit}
        testID="host-settings-rename-modal"
      />
    </>
  );
}

// Connection-status card: the live connection method + status, derived from the runtime
// snapshot (status dot + type badge + readable state).
function ConnectionStatusGroup({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const snapshot = useHostRuntimeSnapshot(serverId);
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";
  const activeConnection = snapshot?.activeConnection ?? null;

  const typeLabel = connectionTypeLabel(activeConnection, t);
  const statusTone = getConnectionStatusTone(connectionStatus);
  const statusText = formatConnectionStatus(connectionStatus);
  const dotStatus = connectionDotStatus(connectionStatus);

  const control = useMemo(
    () => (
      <>
        {typeLabel ? <SettingsBadge label={typeLabel} tone={statusTone} /> : null}
        <SettingsStatusDot status={dotStatus} />
        <SettingsValue value={statusText} />
      </>
    ),
    [typeLabel, statusTone, dotStatus, statusText],
  );

  return (
    <SettingsGroup title="连接状态">
      <SettingsCard>
        <SettingsRow
          label="当前连接方式"
          description="系统按延迟自动择优；逐条连接管理见「连接」段。"
        >
          {control}
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>
  );
}

// "常用" card: restart the host service (always) + pair a phone/tablet (local daemon only).
function CommonGroup({ host, isLocalDaemon }: { host: HostProfile; isLocalDaemon: boolean }) {
  return (
    <SettingsGroup title="常用">
      <SettingsCard>
        <RestartRow host={host} />
        {isLocalDaemon ? <PairRow divider /> : null}
      </SettingsCard>
    </SettingsGroup>
  );
}

const RESTART_WAIT = { disconnectMs: 7000, reconnectMs: 30000, pollMs: 250 } as const;

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Restart row — ports the legacy RestartDaemonCard: confirm → client.restartServer →
// optimistic "restarting" while it waits for disconnect + reconnect; disabled when offline.
function RestartRow({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const daemonClient = useHostRuntimeClient(host.serverId);
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const runtime = getHostRuntimeStore();
  const [isRestarting, setIsRestarting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isHostConnected = useCallback(
    () => isHostRuntimeConnected(runtime.getSnapshot(host.serverId)),
    [host.serverId, runtime],
  );

  const waitForCondition = useCallback(async (predicate: () => boolean, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isMountedRef.current) return false;
      if (predicate()) return true;
      await delay(RESTART_WAIT.pollMs);
    }
    return predicate();
  }, []);

  const waitForRestart = useCallback(async () => {
    if (isHostConnected()) {
      await waitForCondition(() => !isHostConnected(), RESTART_WAIT.disconnectMs);
    }
    const reconnected = await waitForCondition(() => isHostConnected(), RESTART_WAIT.reconnectMs);
    if (!isMountedRef.current) return;
    setIsRestarting(false);
    if (!reconnected) {
      Alert.alert(
        t("settings.host.daemon.restart.unableToReconnectTitle"),
        t("settings.host.daemon.restart.unableToReconnectMessage", { name: host.label }),
      );
    }
  }, [host.label, isHostConnected, t, waitForCondition]);

  const handleRestart = useCallback(() => {
    if (!daemonClient || !isHostConnected()) {
      Alert.alert(
        t("settings.host.daemon.restart.offlineTitle"),
        t("settings.host.daemon.restart.offlineMessage"),
      );
      return;
    }
    void confirmDialog({
      title: t("settings.host.daemon.restart.confirmTitle", { name: host.label }),
      message: t("settings.host.daemon.restart.confirmMessage"),
      confirmLabel: t("settings.host.daemon.restart.confirm"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    })
      .then((confirmed) => {
        if (!confirmed) return;
        setIsRestarting(true);
        void daemonClient
          .restartServer(`settings_daemon_restart_${host.serverId}`)
          .catch((error) => {
            console.error(`[HostSettingsSection] Failed to restart daemon ${host.label}`, error);
            if (!isMountedRef.current) return;
            setIsRestarting(false);
            Alert.alert(
              t("settings.host.daemon.restart.requestFailedTitle"),
              t("settings.host.daemon.restart.requestFailedMessage"),
            );
          });
        void waitForRestart();
        return;
      })
      .catch((error) => {
        console.error(`[HostSettingsSection] Restart confirm failed for ${host.label}`, error);
      });
  }, [daemonClient, host.label, host.serverId, isHostConnected, t, waitForRestart]);

  const label = isRestarting
    ? t("settings.host.daemon.restart.restarting")
    : t("settings.host.daemon.restart.confirm");

  return (
    <SettingsRow
      label={t("settings.host.daemon.restart.title")}
      description={t("settings.host.daemon.restart.hint")}
    >
      <SettingsButton
        label={label}
        icon={RotateCw}
        variant="outline"
        small
        onPress={handleRestart}
        disabled={isRestarting || !daemonClient || !isConnected}
      />
    </SettingsRow>
  );
}

// Pair row — opens the existing PairDeviceModal (QR / link). Mounted only for the local
// daemon, matching the legacy host-page gate; the modal itself surfaces relay-disabled state.
function PairRow({ divider }: { divider?: boolean }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <SettingsRow
      label={t("settings.host.pairDevices.rowTitle")}
      description={t("settings.host.pairDevices.rowHint")}
      divider={divider}
    >
      {/* TODO(i18n): button label hardcoded — no pairing-action key yet. */}
      <SettingsButton
        label="显示二维码 / 链接"
        icon={QrCode}
        variant="primary"
        small
        onPress={handleOpen}
      />
      <PairDeviceModal visible={isOpen} onClose={handleClose} testID="host-settings-pair-modal" />
    </SettingsRow>
  );
}

// Device-local "keep running after quit" toggle — its own pending flag so the switch
// disables only itself while the IPC settles.
function useKeepRunningToggle(update: (next: Partial<DesktopDaemonSettings>) => Promise<unknown>) {
  const [isUpdating, setIsUpdating] = useState(false);
  const onChange = useCallback(
    (next: boolean) => {
      setIsUpdating(true);
      void update({ keepRunningAfterQuit: next })
        .catch(() => {
          // useDesktopSettings owns the user-visible IPC error.
        })
        .finally(() => setIsUpdating(false));
    },
    [update],
  );
  return { isUpdating, onChange };
}

// Logs-modal open state + copy-path action (the path is shown on the card row, not the modal).
function useDaemonLogsModal(logPath: string | null) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const copyPath = useCallback(() => {
    if (!logPath) return;
    void Clipboard.setStringAsync(logPath)
      .then(() => {
        Alert.alert(t("common.states.copied"), t("desktop.daemon.logs.copied"));
        return;
      })
      .catch((error) => console.error("[HostSettingsSection] Failed to copy log path", error));
  }, [logPath, t]);
  return { isOpen, open, close, copyPath };
}

// Full-status modal — lazily runs `helm daemon status` (or captures the fetch error) and
// exposes copy of whatever it surfaced.
function useDaemonStatusModal() {
  const { t } = useTranslation();
  const [output, setOutput] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => {
    setIsLoading(true);
    void (async () => {
      try {
        setOutput(await getCliDaemonStatus());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOutput(t("desktop.daemon.fullStatus.fetchFailed", { message }));
      } finally {
        setIsOpen(true);
        setIsLoading(false);
      }
    })();
  }, [t]);
  const copy = useCallback(() => {
    if (!output) return;
    void Clipboard.setStringAsync(output)
      .then(() => {
        Alert.alert(t("common.states.copied"), t("desktop.daemon.fullStatus.copied"));
        return;
      })
      .catch((error) => console.error("[HostSettingsSection] Failed to copy daemon status", error));
  }, [output, t]);
  return { output, isOpen, isLoading, open, close, copy };
}

interface DaemonInfoCardProps {
  statusError: string | null;
  isRunning: boolean;
  pid: number | null;
  version: string | null;
  home: string | null;
  hasLogs: boolean;
  logPath: string | null;
  manageBuiltInDaemon: boolean;
  isUpdatingManagement: boolean;
  onToggleManagement: (next: boolean) => void;
  keepRunningAfterQuit: boolean;
  isUpdatingKeepRunning: boolean;
  onToggleKeepRunning: (next: boolean) => void;
  isLoadingStatus: boolean;
  onCopyLogPath: () => void;
  onOpenLogs: () => void;
  onOpenStatus: () => void;
}

// Presentational daemon card — status + data dir + the two device toggles + logs / full
// status rows. State lives in the parent; this only renders + dispatches.
function DaemonInfoCard(props: DaemonInfoCardProps) {
  const { t } = useTranslation();
  const stateText =
    props.statusError ??
    (props.isRunning ? t("desktop.daemon.status.running") : t("desktop.daemon.status.notRunning"));
  const pidText = t("desktop.daemon.status.pid", { pid: props.pid ?? "—" });
  const fullStatusLabel = props.isLoadingStatus
    ? t("common.states.loading")
    : t("desktop.daemon.fullStatus.view");

  return (
    <SettingsCard>
      <SettingsRow
        label={t("desktop.daemon.status.title")}
        description={t("desktop.daemon.status.builtInOnly")}
      >
        <View style={styles.statusStack}>
          <View style={styles.statusLine}>
            <SettingsStatusDot status={props.isRunning ? "on" : "off"} />
            <Text style={styles.statusText}>{stateText}</Text>
          </View>
          <Text style={styles.statusSub}>{pidText}</Text>
        </View>
      </SettingsRow>
      <SettingsRow label="版本" description="守护进程当前版本" divider>
        <SettingsValue value={props.version ? `v${props.version}` : "—"} tone="strong" />
      </SettingsRow>
      <SettingsRow label="数据目录" description="这台主机的本地数据 / 配置目录" divider>
        <SettingsValue value={props.home ?? "—"} />
      </SettingsRow>
      <SettingsRow
        label={t("desktop.daemon.management.title")}
        description={t("desktop.daemon.management.hint")}
        divider
      >
        <SettingsToggle
          value={props.manageBuiltInDaemon}
          onChange={props.onToggleManagement}
          disabled={props.isUpdatingManagement}
        />
      </SettingsRow>
      <SettingsRow
        label={t("desktop.daemon.keepRunning.title")}
        description={t("desktop.daemon.keepRunning.hint")}
        divider
      >
        <SettingsToggle
          value={props.keepRunningAfterQuit}
          onChange={props.onToggleKeepRunning}
          disabled={props.isUpdatingKeepRunning}
        />
      </SettingsRow>
      <SettingsRow
        label={t("desktop.daemon.logs.title")}
        description={props.logPath ?? t("desktop.daemon.logs.unavailable")}
        divider
      >
        {props.logPath ? (
          <SettingsButton
            label={t("desktop.daemon.logs.copyPath")}
            icon={Copy}
            variant="outline"
            small
            onPress={props.onCopyLogPath}
          />
        ) : null}
        <SettingsButton
          label={t("desktop.daemon.logs.open")}
          icon={FileText}
          variant="outline"
          small
          onPress={props.onOpenLogs}
          disabled={!props.hasLogs}
        />
      </SettingsRow>
      <SettingsRow
        label={t("desktop.daemon.fullStatus.title")}
        description={t("desktop.daemon.fullStatus.hint")}
        divider
      >
        <SettingsButton
          label={fullStatusLabel}
          icon={Activity}
          variant="outline"
          small
          onPress={props.onOpenStatus}
          disabled={props.isLoadingStatus}
        />
      </SettingsRow>
    </SettingsCard>
  );
}

// The local built-in daemon card (desktop only). Re-skins LocalDaemonSection onto the kit,
// reusing its hooks; mounts hooks first, then bails out when this isn't a desktop-managed
// daemon (mirrors the legacy gate; stable hook order).
function LocalDaemonCard() {
  const { t } = useTranslation();
  const appVersion = resolveAppVersion();
  const { settings, updateSettings, isLoading: isLoadingSettings } = useDesktopSettings();
  const daemonSettings = settings.daemon;
  const { data, isLoading, error: statusError, setStatus, refetch } = useDaemonStatus();

  const updateDaemonSettings = useCallback(
    (updates: Partial<DesktopDaemonSettings>) => updateSettings({ daemon: updates }),
    [updateSettings],
  );

  const daemonStatus = data?.status ?? null;
  const daemonLogs = data?.logs ?? null;
  const daemonVersion = daemonStatus?.version ?? null;
  const versionMismatch = isVersionMismatch(appVersion, daemonVersion);

  const { isUpdating: isUpdatingManagement, toggle } = useBuiltInDaemonManagement({
    daemonStatus,
    settings: daemonSettings,
    updateSettings: updateDaemonSettings,
    setStatus,
    refreshStatus: refetch,
  });
  const handleToggleManagement = useCallback(() => toggle(), [toggle]);
  const keepRunning = useKeepRunningToggle(updateDaemonSettings);
  const logsModal = useDaemonLogsModal(daemonLogs?.logPath ?? null);
  const statusModal = useDaemonStatusModal();

  if (!shouldUseDesktopDaemon()) {
    return null;
  }

  return (
    <SettingsGroup title={t("desktop.daemon.title")}>
      {isLoading || isLoadingSettings ? (
        <SettingsCard>
          <View style={styles.loadingCard}>
            <Text style={settingsKit.rowDesc}>{t("common.states.loading")}</Text>
          </View>
        </SettingsCard>
      ) : (
        <DaemonInfoCard
          statusError={statusError}
          isRunning={daemonStatus?.status === "running"}
          pid={daemonStatus?.pid ?? null}
          version={daemonVersion}
          home={daemonStatus?.home ?? null}
          hasLogs={daemonLogs !== null}
          logPath={daemonLogs?.logPath ?? null}
          manageBuiltInDaemon={daemonSettings.manageBuiltInDaemon}
          isUpdatingManagement={isUpdatingManagement}
          onToggleManagement={handleToggleManagement}
          keepRunningAfterQuit={daemonSettings.keepRunningAfterQuit}
          isUpdatingKeepRunning={keepRunning.isUpdating}
          onToggleKeepRunning={keepRunning.onChange}
          isLoadingStatus={statusModal.isLoading}
          onCopyLogPath={logsModal.copyPath}
          onOpenLogs={logsModal.open}
          onOpenStatus={statusModal.open}
        />
      )}

      {versionMismatch ? (
        <SettingsAlert tone="warning" icon={WifiOff} title={t("desktop.daemon.versionMismatch")} />
      ) : null}

      <DaemonLogsModal visible={logsModal.isOpen} onClose={logsModal.close} logs={daemonLogs} />
      <DaemonStatusModal
        visible={statusModal.isOpen}
        onClose={statusModal.close}
        output={statusModal.output}
        onCopy={statusModal.copy}
      />
    </SettingsGroup>
  );
}

// Daemon logs modal — path + mono log body. Copy-path lives on the card row, not here
// (matching the legacy DaemonLogsModal).
function DaemonLogsModal({
  visible,
  onClose,
  logs,
}: {
  visible: boolean;
  onClose: () => void;
  logs: { logPath?: string; contents?: string } | null;
}) {
  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(() => ({ title: t("desktop.daemon.logs.modalTitle") }), [t]);
  const body = logs?.contents?.length ? logs.contents : t("desktop.daemon.logs.empty");

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      testID="host-settings-daemon-logs-modal"
      snapPoints={LOGS_MODAL_SNAP_POINTS}
    >
      <View style={styles.modalBody}>
        <Text style={styles.modalPath}>
          {logs?.logPath ?? t("desktop.daemon.logs.unavailable")}
        </Text>
        <Text style={styles.modalMono} selectable>
          {body}
        </Text>
      </View>
    </AdaptiveModalSheet>
  );
}

// Full-status modal — mono `helm daemon status` output (or fetch-error text) + close / copy.
function DaemonStatusModal({
  visible,
  onClose,
  output,
  onCopy,
}: {
  visible: boolean;
  onClose: () => void;
  output: string | null;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(
    () => ({ title: t("desktop.daemon.fullStatus.modalTitle") }),
    [t],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      testID="host-settings-daemon-status-modal"
      snapPoints={STATUS_MODAL_SNAP_POINTS}
    >
      <View style={styles.modalBody}>
        <Text style={styles.modalMono} selectable>
          {output ?? ""}
        </Text>
        <View style={styles.modalActions}>
          <SettingsButton
            label={t("common.actions.close")}
            variant="outline"
            small
            onPress={onClose}
          />
          <SettingsButton
            label={t("common.actions.copy")}
            icon={Copy}
            variant="primary"
            small
            onPress={onCopy}
          />
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

// config.json (cfg1) editor — desktop only (no raw-JSON editing on compact / native). isNative
// is a module constant, so the early return doesn't break hook order.
function HostConfigEditorGroup({ serverId }: { serverId: string }) {
  if (isNative) {
    return null;
  }
  return <HostConfigEditor serverId={serverId} />;
}

// The editor body — ports HostConfigEditorSection's wiring verbatim: client.readHostConfig on
// mount, validateHostConfigText on every change (client-side syntax/shape only; full schema is
// the server's authority via writeHostConfig), format / revert, and optimistic-revision save
// with stale/invalid handling. Re-skinned onto the kit + a local mono+gutter editor surface.
function HostConfigEditor({ serverId }: { serverId: string }) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const [text, setText] = useState<string | null>(null);
  const [loadedText, setLoadedText] = useState("");
  const [revision, setRevision] = useState<HostConfigRevision | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!client) return;
    const payload = await client.readHostConfig();
    if (payload.ok) {
      const next = payload.text ?? "";
      setText(next);
      setLoadedText(next);
      setRevision(payload.revision);
      setServerError(null);
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!client) return;
      const payload = await client.readHostConfig();
      if (cancelled || !payload.ok) return;
      const next = payload.text ?? "";
      setText(next);
      setLoadedText(next);
      setRevision(payload.revision);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const validation = useMemo(() => (text === null ? null : validateHostConfigText(text)), [text]);
  const dirty = text !== null && text !== loadedText;
  const isValid = validation?.status === "valid";

  const lineNumbers = useMemo(() => {
    const count = (text ?? "").split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1).join("\n");
  }, [text]);

  const handleFormat = useCallback(() => {
    if (text === null) return;
    try {
      setText(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      // Format is disabled while invalid, so this branch shouldn't be reachable.
    }
  }, [text]);

  const handleRevert = useCallback(() => setText(loadedText), [loadedText]);

  const handleSave = useCallback(async () => {
    if (!client || text === null || !isValid) return;
    setSaving(true);
    setServerError(null);
    try {
      const payload = await client.writeHostConfig({ text, expectedRevision: revision });
      if (payload.ok) {
        setLoadedText(payload.text);
        setRevision(payload.revision);
      } else if (payload.error.code === "stale") {
        setServerError("配置已被外部修改，已重新加载磁盘版本");
        await reload();
      } else if (payload.error.code === "invalid") {
        setServerError(payload.error.message ?? "配置不符合 schema");
      } else {
        setServerError("写入失败");
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [client, text, isValid, revision, reload]);

  if (!isConnected) {
    return (
      <SettingsGroup title="配置文件 (config.json)">
        <SettingsCard>
          <Text style={styles.editorNotice}>主机离线，配置文件只读不可编辑。</Text>
        </SettingsCard>
      </SettingsGroup>
    );
  }

  const badge = describeEditorBadge(validation);
  const validationError =
    validation?.status === "invalid" && validation.error ? validation.error.message : null;

  return (
    <SettingsGroup title="配置文件 (config.json)">
      <SettingsCard>
        <View style={styles.editorToolbar}>
          <SettingsBadge label={badge.label} tone={badge.tone} icon={isValid ? Check : undefined} />
          <View style={styles.editorActions}>
            <SettingsButton
              label="格式化"
              icon={Sliders}
              variant="outline"
              small
              onPress={handleFormat}
              disabled={!isValid}
            />
            <SettingsButton
              label="恢复"
              icon={RefreshCw}
              variant="ghost"
              small
              onPress={handleRevert}
              disabled={!dirty}
            />
            <SettingsButton
              label={saving ? "保存中…" : "保存"}
              icon={Check}
              variant="primary"
              small
              onPress={handleSave}
              disabled={saving || !dirty || !isValid}
            />
          </View>
        </View>
        <View style={styles.editorBody}>
          <Text style={styles.editorGutter}>{lineNumbers}</Text>
          <TextInput
            style={styles.editorInput}
            value={text ?? ""}
            onChangeText={setText}
            editable={text !== null && !saving}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder="{ }"
            testID="host-settings-config-editor"
          />
        </View>
        {validationError ? <Text style={styles.editorErrorLine}>{validationError}</Text> : null}
        {serverError ? <Text style={styles.editorErrorLine}>{serverError}</Text> : null}
      </SettingsCard>
    </SettingsGroup>
  );
}

// Danger zone — remove this host. Ports RemoveHostSection's wiring: for the local daemon it
// first disables desktop management + stops the daemon (with rollback on failure); on success
// it navigates away (this entry has no onHostRemoved callback).
function RemoveHostGroup({ host, isLocalDaemon }: { host: HostProfile; isLocalDaemon: boolean }) {
  const { t } = useTranslation();
  const { removeHost } = useHostMutations();
  const { updateSettings } = useDesktopSettings();
  const { data: daemonStatusData, setStatus } = useDaemonStatus();
  const [isRemoving, setIsRemoving] = useState(false);
  const daemonStatus = daemonStatusData?.status ?? null;

  const rollbackLocalRemoval = useCallback(
    async (shouldRestartDaemon: boolean) => {
      await updateSettings({ daemon: { manageBuiltInDaemon: true } });
      if (!shouldRestartDaemon) return;
      setStatus(await startDesktopDaemon());
    },
    [setStatus, updateSettings],
  );

  const handleRemove = useCallback(() => {
    void (async () => {
      const confirmed = await confirmDialog({
        title: isLocalDaemon
          ? t("settings.host.daemon.remove.localConfirmTitle")
          : t("settings.host.daemon.remove.title"),
        message: isLocalDaemon
          ? t("settings.host.daemon.remove.localConfirmMessage")
          : t("settings.host.daemon.remove.confirmMessage", { name: host.label }),
        confirmLabel: t("settings.host.connections.removeAction"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      setIsRemoving(true);
      let disabledManagement = false;
      let stoppedDaemon = false;
      try {
        if (isLocalDaemon) {
          await updateSettings({ daemon: { manageBuiltInDaemon: false } });
          disabledManagement = true;
          if (daemonStatus?.status === "running" && daemonStatus.desktopManaged) {
            setStatus(await stopDesktopDaemon());
            stoppedDaemon = true;
          }
        }
        await removeHost(host.serverId);
        navigateToLastWorkspace();
      } catch (error) {
        if (disabledManagement) {
          await rollbackLocalRemoval(stoppedDaemon).catch((rollbackError) =>
            console.error("[HostSettingsSection] Failed to roll back local removal", rollbackError),
          );
        }
        console.error("[HostSettingsSection] Failed to remove host", error);
        Alert.alert(
          t("settings.host.daemon.remove.errorTitle"),
          isLocalDaemon
            ? t("settings.host.daemon.remove.localErrorMessage")
            : t("settings.host.daemon.remove.errorMessage"),
        );
      } finally {
        setIsRemoving(false);
      }
    })();
  }, [
    daemonStatus,
    host.label,
    host.serverId,
    isLocalDaemon,
    removeHost,
    rollbackLocalRemoval,
    setStatus,
    t,
    updateSettings,
  ]);

  return (
    <SettingsGroup title={t("settings.host.daemon.dangerZone")}>
      <SettingsCard>
        <SettingsRow
          label={
            isLocalDaemon
              ? t("settings.host.daemon.remove.localTitle")
              : t("settings.host.daemon.remove.title")
          }
          description={
            isLocalDaemon
              ? t("settings.host.daemon.remove.localHint")
              : t("settings.host.daemon.remove.hint")
          }
        >
          <SettingsButton
            label={t("settings.host.connections.removeAction")}
            icon={Trash2}
            variant="danger"
            small
            onPress={handleRemove}
            disabled={isRemoving}
          />
        </SettingsRow>
      </SettingsCard>
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  loadingCard: {
    padding: theme.spacing[6],
    alignItems: "center",
  },
  statusStack: {
    alignItems: "flex-end",
    gap: 2,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  statusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  statusSub: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
  },
  editorToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  editorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  editorBody: {
    flexDirection: "row",
    minHeight: 320,
  },
  editorGutter: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    textAlign: "right",
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: 20,
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface2,
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
  },
  editorInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: 20,
    color: theme.colors.foreground,
    textAlignVertical: "top",
  },
  editorErrorLine: {
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[2],
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.mono,
  },
  editorNotice: {
    padding: theme.spacing[4],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
  modalBody: {
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  modalPath: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
  },
  modalMono: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
