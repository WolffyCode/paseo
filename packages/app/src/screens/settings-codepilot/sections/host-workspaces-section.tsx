// Workspaces (host section) — rebuilt on the codePilot settings kit. Pure re-skin: the data
// wiring (host lookup, connection gate, and the daemon-config auto-archive-after-merge
// toggle) is reused unchanged from the legacy HostWorkspacesPage; only the presentation moves
// onto SettingsDetail / SettingsGroup / SettingsCard / SettingsRow / SettingsToggle. The legacy
// section had no workspace list — its single real action is the merged-PR auto-archive toggle.
import { useCallback } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import {
  SettingsCard,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from "../primitives";

// Section shell: renders the detail header, then defers the body to a connection-gated child so
// the title/subtitle stay visible even when the host is offline or unknown.
export function HostWorkspacesSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  return (
    <SettingsDetail
      title={t("settings.hostSections.workspaces")}
      subtitle="管理这台主机的工作区行为。拉取请求(PR)合并后，可自动归档已完成且干净的工作区。"
    >
      <WorkspacesBody serverId={serverId} />
    </SettingsDetail>
  );
}

// Body gate: mirrors the legacy page's three states — unknown host, disconnected host, and the
// connected host's workspace settings card. The two unavailable states use the kit's dashed box.
function WorkspacesBody({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const host = hosts.find((entry) => entry.serverId === serverId) ?? null;

  if (!host) {
    return <SettingsEmpty message={t("settings.host.notFound")} />;
  }
  if (!isConnected) {
    return <SettingsEmpty message={t("settings.host.workspaces.unavailable")} />;
  }
  return (
    <SettingsGroup title="工作区归档">
      <SettingsCard>
        <AutoArchiveRow serverId={serverId} />
      </SettingsCard>
    </SettingsGroup>
  );
}

// The auto-archive-after-merge toggle row. Reads/writes the host's daemon config through the same
// useDaemonConfig hook the legacy card used; a failed patch surfaces an Alert.
function AutoArchiveRow({ serverId }: { serverId: string }) {
  const { config, patchConfig } = useDaemonConfig(serverId);
  const value = config?.autoArchiveAfterMerge === true;

  const handleChange = useCallback(
    (next: boolean) => {
      void patchConfig({ autoArchiveAfterMerge: next }).catch((error) => {
        console.error("[HostWorkspacesSection] Failed to update auto-archive after merge", error);
        Alert.alert("无法更新工作区设置", error instanceof Error ? error.message : String(error));
      });
    },
    [patchConfig],
  );

  return (
    <SettingsRow label="合并后归档工作区" description="拉取请求(PR)合并后，自动归档干净的工作区。">
      <SettingsToggle value={value} onChange={handleChange} />
    </SettingsRow>
  );
}
