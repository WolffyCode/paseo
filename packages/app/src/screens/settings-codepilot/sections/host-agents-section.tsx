// Host → Agents — orchestration controls for the agents this host runs: the "Enable Helm
// tools" MCP-injection toggle and an editable system prompt appended to every agent. Pure
// re-skin onto the codePilot kit: the data wiring (daemon-config read + patchConfig
// mutations, host lookup, connection gate, system-prompt editor sheet) is reused unchanged
// from the legacy HostAgentsPage; only the presentation moves to the kit.
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Pencil } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import {
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from "../primitives";

const SUBTITLE =
  "管理这台主机上 agent 的编排：是否向 agent 注入 Helm 工具（让其管理工作树 / agent / 计划），以及附加到所有 agent 的系统提示词。";

// The Host → Agents detail pane. Looks up the host, then gates the orchestration card on a
// live connection — daemon config can only be read/written while the host is online, exactly
// like the legacy HostAgentsPage.
export function HostAgentsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const host = hosts.find((entry) => entry.serverId === serverId) ?? null;

  if (!host) {
    return (
      <SettingsDetail title={t("settings.hostSections.agents")} subtitle={SUBTITLE}>
        <SettingsEmpty message={t("settings.host.notFound")} />
      </SettingsDetail>
    );
  }

  return (
    <SettingsDetail title={t("settings.hostSections.agents")} subtitle={SUBTITLE}>
      {isConnected ? (
        <SettingsGroup title={t("settings.host.orchestration.title")}>
          <SettingsCard>
            <EnableToolsRow serverId={serverId} />
            <SystemPromptRow serverId={serverId} />
          </SettingsCard>
        </SettingsGroup>
      ) : (
        <SettingsEmpty message={t("settings.host.agents.unavailable")} />
      )}
    </SettingsDetail>
  );
}

// The "Enable Helm tools" toggle row. Mirrors the legacy InjectPaseoToolsCard: injection
// defaults ON (only an explicit `false` disables it), and flipping it patches the daemon's
// `mcp.injectIntoAgents` flag so the change takes effect immediately.
function EnableToolsRow({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const enabled = config?.mcp.injectIntoAgents !== false;

  const handleToggle = useCallback(
    (next: boolean) => {
      void patchConfig({ mcp: { injectIntoAgents: next } });
    },
    [patchConfig],
  );

  return (
    <SettingsRow
      label={t("settings.host.orchestration.enableTools.title")}
      description={t("settings.host.orchestration.enableTools.hint")}
    >
      <SettingsToggle value={enabled} onChange={handleToggle} />
    </SettingsRow>
  );
}

// The system-prompt row + its editor sheet. Mirrors the legacy AppendSystemPromptCard: the
// row shows an Edit button that opens an AdaptiveModalSheet textarea; saving patches the
// daemon's `appendSystemPrompt`. The persisted value resyncs the draft, and the sheet is
// locked while a save is in flight.
function SystemPromptRow({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persistedPrompt = config?.appendSystemPrompt ?? "";
  const [draft, setDraft] = useState(persistedPrompt);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.orchestration.systemPrompt.sheetTitle") }),
    [t],
  );

  useEffect(() => {
    setDraft(persistedPrompt);
  }, [persistedPrompt]);

  const hasChanges = draft !== persistedPrompt;
  const actionsDisabled = !hasChanges || isSaving;

  const handleOpen = useCallback(() => {
    setDraft(persistedPrompt);
    setIsEditing(true);
  }, [persistedPrompt]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    setDraft(persistedPrompt);
    setIsEditing(false);
  }, [isSaving, persistedPrompt]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    void patchConfig({ appendSystemPrompt: draft })
      .then(() => {
        setIsEditing(false);
        return;
      })
      .catch((error) => {
        console.error("[HostAgentsSection] Failed to save append system prompt", error);
      })
      .finally(() => setIsSaving(false));
  }, [draft, patchConfig]);

  const handleReset = useCallback(() => {
    setDraft(persistedPrompt);
  }, [persistedPrompt]);

  const saveLabel = isSaving
    ? t("settings.host.orchestration.systemPrompt.saving")
    : t("settings.host.orchestration.systemPrompt.save");

  return (
    <>
      <SettingsRow
        label={t("settings.host.orchestration.systemPrompt.title")}
        description={t("settings.host.orchestration.systemPrompt.hint")}
        divider
      >
        <SettingsButton
          label={t("settings.host.orchestration.systemPrompt.edit")}
          icon={Pencil}
          small
          onPress={handleOpen}
        />
      </SettingsRow>
      {isEditing ? (
        <AdaptiveModalSheet
          header={header}
          visible
          onClose={handleClose}
          testID="host-agents-system-prompt-sheet"
          desktopMaxWidth={560}
        >
          <SettingsTextAreaCard
            testID="host-agents-system-prompt-input"
            accessibilityLabel={t("settings.host.orchestration.systemPrompt.accessibilityLabel")}
            value={draft}
            onChangeText={setDraft}
            placeholder={t("settings.host.orchestration.systemPrompt.placeholder")}
          />
          <View style={styles.modalActions}>
            <SettingsButton
              label={t("settings.host.orchestration.systemPrompt.reset")}
              variant="ghost"
              small
              onPress={handleReset}
              disabled={actionsDisabled}
            />
            <SettingsButton
              label={saveLabel}
              variant="primary"
              small
              onPress={handleSave}
              disabled={actionsDisabled}
            />
          </View>
        </AdaptiveModalSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
}));
