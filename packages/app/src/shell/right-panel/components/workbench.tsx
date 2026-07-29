import { observer } from "mobx-react-lite";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AgentConversationPanel } from "@/panels/agent-panel";
import {
  createPaneFocusContextValue,
  PaneFocusProvider,
  PaneProvider,
  type PaneContextValue,
} from "@/panels/pane-context";
import type { WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import type { WorkspaceFileOpenRequest } from "@/workspace/file-open";
import { ConversationTabContent } from "../conversation-tab/model/conversation-tab-content";
import type { ConnectableEditorHandle } from "../file-tab/components/editor-handle";
import { FileTabView } from "../file-tab/components/file-tab-view";
import { FileDocumentModel } from "../file-tab/model/file-document-model";
import type { TabContent } from "../model/tab-content";
import type { PanelTab, WorkbenchModel } from "../model/workbench-model";
import { STATUS_TOKENS } from "../theme/status-tokens";
import { themeModel } from "../../theme/theme-model";
import { IconSpinner, IconWifiOff } from "./icons";
import { Launcher } from "./launcher";
import { TabBar } from "./tab-bar";

// The right panel's content assembly (ui.html sRS1–sRS9) — the observer that composes the whole panel:
// launcher when the workbench is empty, else the tab strip + the focused tab's content (this round only
// `file`, delegated to FileTabView). Offline shows the top reconnect banner and freezes the content
// (FileTabView reads isOffline). The framework models never import a concrete tab type; content delegation
// happens here, where importing FileDocumentModel is allowed.

export const Workbench = observer(function Workbench({
  workbench,
  resolveEditorHandle,
  isOffline,
  serverId,
  canCreateConversation,
  onCreateConversation,
  onOpenConversationFile,
  resolveAgentTitle,
}: {
  workbench: WorkbenchModel;
  resolveEditorHandle: (content: TabContent) => ConnectableEditorHandle;
  isOffline: boolean;
  serverId: string;
  canCreateConversation: boolean;
  onCreateConversation: () => void;
  onOpenConversationFile: (workspaceId: string, request: WorkspaceFileOpenRequest) => void;
  resolveAgentTitle: (agentId: string) => string | null;
}) {
  if (workbench.mode === "launcher") {
    return (
      <Launcher
        isOffline={isOffline}
        canCreateConversation={canCreateConversation}
        onCreateConversation={onCreateConversation}
      />
    );
  }
  const focused = workbench.tabs.find((tab) => tab.id === workbench.focusedTabId) ?? null;
  // A content subtree owns exactly one tab identity per mount. The key makes a focus switch disconnect
  // the old imperative surface before a fresh surface binds the next tab's document and editor handle.
  return (
    <View style={styles.root}>
      <TabBar
        workbench={workbench}
        isOffline={isOffline}
        canCreateConversation={canCreateConversation}
        onCreateConversation={onCreateConversation}
      />
      {isOffline ? <OfflineBanner /> : null}
      {focused ? (
        <TabContent
          key={focused.id}
          tab={focused}
          resolveEditorHandle={resolveEditorHandle}
          isOffline={isOffline}
          serverId={serverId}
          workbench={workbench}
          onOpenConversationFile={onOpenConversationFile}
          resolveAgentTitle={resolveAgentTitle}
        />
      ) : null}
    </View>
  );
});

// Delegate to the focused tab's content renderer by kind. This round the only openable kind is `file`;
// future kinds (terminal/browser/review/conversation) add their own arm here.
const TabContent = observer(function TabContent({
  tab,
  resolveEditorHandle,
  isOffline,
  serverId,
  workbench,
  onOpenConversationFile,
  resolveAgentTitle,
}: {
  tab: PanelTab;
  resolveEditorHandle: (content: TabContent) => ConnectableEditorHandle;
  isOffline: boolean;
  serverId: string;
  workbench: WorkbenchModel;
  onOpenConversationFile: (workspaceId: string, request: WorkspaceFileOpenRequest) => void;
  resolveAgentTitle: (agentId: string) => string | null;
}) {
  if (tab.kind === "file" && tab.content instanceof FileDocumentModel) {
    return (
      <FileTabView
        doc={tab.content}
        editorHandle={resolveEditorHandle(tab.content)}
        isOffline={isOffline}
      />
    );
  }
  if (tab.kind === "conversation" && tab.content instanceof ConversationTabContent) {
    return (
      <ConversationTabView
        tab={tab}
        content={tab.content}
        serverId={serverId}
        workbench={workbench}
        onOpenFile={onOpenConversationFile}
        resolveAgentTitle={resolveAgentTitle}
      />
    );
  }
  return null;
});

const NOOP = () => {};

/** Mount one conversation tab through the established pane context and conversation panel. */
function ConversationTabView({
  tab,
  content,
  serverId,
  workbench,
  onOpenFile,
  resolveAgentTitle,
}: {
  tab: PanelTab;
  content: ConversationTabContent;
  serverId: string;
  workbench: WorkbenchModel;
  onOpenFile: (workspaceId: string, request: WorkspaceFileOpenRequest) => void;
  resolveAgentTitle: (agentId: string) => string | null;
}) {
  const retarget = useCallback(
    (target: WorkspaceTabTarget): void => {
      if (target.kind !== "agent" && target.kind !== "draft") return;
      workbench.retargetConversationTab(tab.id, {
        kind: "conversation",
        target,
        workspaceId: content.workspaceId,
        title:
          target.kind === "draft" ? "新对话" : (resolveAgentTitle(target.agentId) ?? content.title),
        readOnly: target.kind === "agent" ? content.readOnly : false,
      });
    },
    [content.readOnly, content.title, content.workspaceId, resolveAgentTitle, tab.id, workbench],
  );
  const close = useCallback(() => workbench.closeTab(tab.id), [tab.id, workbench]);
  const openFile = useCallback(
    (request: WorkspaceFileOpenRequest) => onOpenFile(content.workspaceId, request),
    [content.workspaceId, onOpenFile],
  );
  const paneContext = useMemo<PaneContextValue>(
    () => ({
      serverId,
      workspaceId: content.workspaceId,
      tabId: tab.id,
      target: content.target,
      openTab: retarget,
      closeCurrentTab: close,
      retargetCurrentTab: retarget,
      openFileInWorkspace: openFile,
      openImportSheet: NOOP,
    }),
    [close, content.target, content.workspaceId, openFile, retarget, serverId, tab.id],
  );
  const paneFocus = useMemo(
    () =>
      createPaneFocusContextValue({
        isWorkspaceFocused: true,
        isPaneFocused: true,
      }),
    [],
  );
  return (
    <View style={styles.conversation} testID={`right-conversation-${tab.id}`}>
      <PaneProvider value={paneContext}>
        <PaneFocusProvider value={paneFocus}>
          <AgentConversationPanel draftLayout="docked" forceReadOnly={content.readOnly} />
        </PaneFocusProvider>
      </PaneProvider>
    </View>
  );
}

// The panel-level offline banner: all tabs frozen, host reconnecting (ui.html sRS9 .offbar).
const OfflineBanner = observer(function OfflineBanner() {
  const tk = themeModel.tokens;
  const warn = STATUS_TOKENS[themeModel.scheme].warning;
  const bar = useMemo(
    () => [
      styles.offbar,
      { backgroundColor: withAlpha(warn, 0.12), borderColor: withAlpha(warn, 0.3) },
    ],
    [warn],
  );
  const text = useMemo(() => [styles.offText, { color: warn }], [warn]);
  const reconnect = useMemo(() => [styles.reconnect, { color: tk.accent }], [tk.accent]);
  return (
    <View style={bar}>
      <IconWifiOff size={14} color={warn} />
      <Text style={text}>主机离线 · 所有页签内容已冻结</Text>
      <View style={styles.reconnectWrap}>
        <IconSpinner size={12} color={tk.accent} />
        <Text style={reconnect}>重连中…</Text>
      </View>
    </View>
  );
});

// Overlay alpha on a #rrggbb token for the banner wash.
function withAlpha(color: string, alpha: number): string {
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, minHeight: 0 },
  conversation: { flex: 1, minWidth: 0, minHeight: 0 },
  offbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  offText: { fontSize: 12, flexShrink: 1 },
  reconnectWrap: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto" },
  reconnect: { fontSize: 12, fontWeight: "500" },
});
