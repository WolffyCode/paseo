import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ConnectableEditorHandle } from "../file-tab/components/editor-handle";
import { FileTabView } from "../file-tab/components/file-tab-view";
import { FileDocumentModel } from "../file-tab/model/file-document-model";
import type { RightPanelController } from "../model/right-panel-controller";
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
  controller,
  resolveEditorHandle,
  isOffline,
}: {
  workbench: WorkbenchModel;
  controller: RightPanelController;
  resolveEditorHandle: (content: TabContent) => ConnectableEditorHandle;
  isOffline: boolean;
}) {
  if (workbench.mode === "launcher") {
    return <Launcher controller={controller} isOffline={isOffline} />;
  }
  const focused = workbench.tabs.find((tab) => tab.id === workbench.focusedTabId) ?? null;
  return (
    <View style={styles.root}>
      <TabBar workbench={workbench} controller={controller} isOffline={isOffline} />
      {isOffline ? <OfflineBanner /> : null}
      {focused ? (
        <TabContent tab={focused} resolveEditorHandle={resolveEditorHandle} isOffline={isOffline} />
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
}: {
  tab: PanelTab;
  resolveEditorHandle: (content: TabContent) => ConnectableEditorHandle;
  isOffline: boolean;
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
  return null;
});

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
  root: { flex: 1, minHeight: 0 },
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
