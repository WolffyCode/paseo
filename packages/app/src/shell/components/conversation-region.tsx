import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { AgentSnapshotPayload, WorkspaceDescriptorPayload } from "@getpaseo/protocol/messages";
import { WorkspaceDraftAgentTab } from "@/composer/draft/workspace-tab";
import { AgentConversationPanel } from "@/panels/agent-panel";
import {
  createPaneFocusContextValue,
  PaneFocusProvider,
  PaneProvider,
  type PaneContextValue,
} from "@/panels/pane-context";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceFileOpenRequest } from "@/workspace/file-open";
import { normalizeAgentSnapshot } from "@/utils/agent-snapshots";
import { applyLegacyDaemonWorkspaceOwnership } from "@/workspace/legacy-daemon-workspaces";
import { useSessionStore } from "@/stores/session-store";
import { rightTabBridge } from "../file-tree/model/right-tab-bridge.wiring";
import type { ConversationTreeStore } from "../conversation-tree/model/conversation-tree-store";
import {
  CONVERSATION_DRAG_MIME,
  decodeConversationDrag,
} from "../conversation-tree/model/conversation-drag";
import { isWeb } from "@/constants/platform";
import { i18nModel } from "../i18n/i18n-model";
import { themeModel } from "../theme/theme-model";
import { absoluteHostPath, resolveConversationRegionTarget } from "./conversation-region-model";
import { iconMuted, ShellMessageSquare } from "./icons";

const NOOP = () => {};

/** Rebuild the picker copy whenever the shell locale changes. */
function buildWorkspacePickerLabels(_locale: string) {
  return {
    selectDirectory: i18nModel.t("shell.conversation.selectDirectory"),
    inputPlaceholder: i18nModel.t("shell.conversation.directoryPlaceholder"),
    opening: i18nModel.t("shell.conversation.directoryOpening"),
    empty: i18nModel.t("shell.conversation.directoryEmpty"),
    openPath: i18nModel.t("shell.conversation.directoryOpenPath"),
    openFailed: i18nModel.t("shell.conversation.directoryOpenFailed"),
  };
}

/** Mount the established conversation surface for the root selected in the left tree. */
export const ConversationRegion = observer(function ConversationRegion({
  serverId,
  store,
}: {
  serverId: string;
  store: ConversationTreeStore | null;
}) {
  const target =
    store === null
      ? null
      : resolveConversationRegionTarget({
          focusedRootId: store.focusedRootId,
          draftTarget: store.draftTarget,
          pendingAgentTarget: store.pendingAgentTarget,
          agents: store.agents,
          workspaceDetails: store.workspaceDetails,
        });
  const tk = themeModel.tokens;
  const dropRef = useRef<View | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const emptyTextStyle = useMemo(
    () => [styles.emptyText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );

  const openFile = useCallback(
    (request: WorkspaceFileOpenRequest) => {
      if (target === null || target.workspaceId === null) {
        return;
      }
      rightTabBridge.openFileInRightTab({
        serverId,
        workspaceId: target.workspaceId,
        location: {
          ...request.location,
          path: absoluteHostPath(target.workspaceRoot, request.location.path),
        },
      });
    },
    [serverId, target],
  );

  const retarget = useCallback(
    (nextTarget: WorkspaceTabTarget) => {
      if (store === null || nextTarget.kind !== "agent") {
        return;
      }
      if (store.draftTarget !== null) {
        store.completeDraft(nextTarget.agentId);
        return;
      }
      const node = store.visibleRows.find((row) => row.node.id === nextTarget.agentId)?.node;
      if (node?.kind === "conversation" || node?.kind === "subagent") {
        store.activateNode(node);
      }
    },
    [store],
  );

  const paneContext = useMemo<PaneContextValue | null>(() => {
    if (target === null || target.kind !== "agent") {
      return null;
    }
    return {
      serverId,
      workspaceId: target.workspaceId,
      tabId: `shell-center:${target.agentId}`,
      target: { kind: "agent", agentId: target.agentId },
      openTab: retarget,
      closeCurrentTab: NOOP,
      retargetCurrentTab: retarget,
      openFileInWorkspace: openFile,
      openImportSheet: NOOP,
    };
  }, [openFile, retarget, serverId, target]);
  const paneFocus = useMemo(
    () =>
      createPaneFocusContextValue({
        isWorkspaceFocused: true,
        isPaneFocused: true,
      }),
    [],
  );

  useEffect(() => {
    if (!isWeb) return;
    const element = dropRef.current as unknown as HTMLElement | null;
    if (element === null) return;
    const accepts = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes(CONVERSATION_DRAG_MIME);
    const over = (event: DragEvent): void => {
      if (!accepts(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDropActive(true);
    };
    const leave = (event: DragEvent): void => {
      if (!element.contains(event.relatedTarget as Node | null)) setDropActive(false);
    };
    const drop = (event: DragEvent): void => {
      if (!accepts(event)) return;
      event.preventDefault();
      setDropActive(false);
      const payload = decodeConversationDrag(
        event.dataTransfer?.getData(CONVERSATION_DRAG_MIME) ?? "",
      );
      if (payload !== null) {
        store?.openConversationInRightPanel({ ...payload, readOnly: false });
      }
    };
    element.addEventListener("dragover", over);
    element.addEventListener("dragleave", leave);
    element.addEventListener("drop", drop);
    return () => {
      element.removeEventListener("dragover", over);
      element.removeEventListener("dragleave", leave);
      element.removeEventListener("drop", drop);
    };
  }, [store]);

  const regionStyle = useMemo(
    () => [
      styles.region,
      dropActive
        ? { backgroundColor: tk.toggleActive, borderColor: tk.accent, borderWidth: 1 }
        : null,
    ],
    [dropActive, tk.accent, tk.toggleActive],
  );
  const emptyRegionStyle = useMemo(() => [styles.empty, regionStyle], [regionStyle]);

  const bindDraftWorkspace = useCallback(
    (workspace: WorkspaceDescriptorPayload) => store?.bindDraftWorkspace(workspace),
    [store],
  );
  const completeDraft = useCallback(
    (snapshot: AgentSnapshotPayload) => {
      const normalized = normalizeAgentSnapshot(snapshot, serverId);
      const agent = applyLegacyDaemonWorkspaceOwnership({ serverId, agent: normalized });
      useSessionStore.getState().setAgents(serverId, (previous) => {
        const next = new Map(previous);
        next.set(agent.id, agent);
        return next;
      });
      store?.completeDraft(snapshot.id);
    },
    [serverId, store],
  );
  const locale = i18nModel.locale;
  const workspacePicker = useMemo(
    () => ({
      labels: buildWorkspacePickerLabels(locale),
      onSelected: bindDraftWorkspace,
    }),
    [bindDraftWorkspace, locale],
  );

  if (target === null && (store === null || store.panelState === "loading")) {
    return (
      <View ref={dropRef} style={emptyRegionStyle} testID="conversation-region-loading">
        <ActivityIndicator size="small" color={tk.accent} />
      </View>
    );
  }

  if (target?.kind === "draft") {
    return (
      <View ref={dropRef} style={regionStyle} testID="conversation-region-draft">
        <WorkspaceDraftAgentTab
          key={target.draftId}
          serverId={serverId}
          workspaceId={target.workspaceId}
          tabId={`shell-center:${target.draftId}`}
          draftId={target.draftId}
          isPaneFocused
          onCreated={completeDraft}
          onOpenWorkspaceFile={openFile}
          emptyLayout="docked"
          workspacePicker={workspacePicker}
        />
      </View>
    );
  }

  if (target === null || paneContext === null) {
    return (
      <View ref={dropRef} style={emptyRegionStyle} testID="conversation-region-empty">
        <ShellMessageSquare size={22} color={iconMuted(tk)} />
        <Text style={emptyTextStyle}>{i18nModel.t("shell.conversation.empty")}</Text>
      </View>
    );
  }

  return (
    <View ref={dropRef} style={regionStyle} testID="conversation-region">
      <PaneProvider value={paneContext}>
        <PaneFocusProvider value={paneFocus}>
          <AgentConversationPanel key={target.agentId} draftLayout="docked" />
        </PaneFocusProvider>
      </PaneProvider>
    </View>
  );
});

const styles = StyleSheet.create({
  region: { flex: 1, minWidth: 0, minHeight: 0 },
  empty: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  emptyText: { fontSize: 13, fontWeight: "500" },
});
