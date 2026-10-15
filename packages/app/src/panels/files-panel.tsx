import { Text, View } from "react-native";
import { Files, Folder, PanelRightClose } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useAddFileToChat } from "@/panels/use-add-file-to-chat";
import { useWorkspace, useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { workbenchModel } from "@/workbench/runtime";

const TreeFolder = withUnistyles(Folder, (theme) => ({ color: theme.colors.foregroundMuted }));
const CollapseFiles = withUnistyles(PanelRightClose, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const NO_SHORTCUT: string[] = [];
const collapseFiles = () => workbenchModel.setRegionVisible("files", false);

const ThemedFiles = withUnistyles(Files);
const filesPanelPresentation = {
  label: (t) => t("panels.files.label"),
  subtitle: (t) => t("panels.files.subtitle"),
  tooltip: (t) => t("panels.files.tooltip"),
  icon: ThemedFiles,
} satisfies PanelPresentation;

function FilesPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, tabId, target, host, openPreferredTarget, openTargetToSide } =
    usePaneContext();
  const workspace = useWorkspace(serverId, workspaceId);
  const workspaceRoot = useWorkspaceDirectory(serverId, workspaceId);
  const { addFile, canAddToChat } = useAddFileToChat({ serverId, workspaceId });
  invariant(target.kind === "files", "FilesPanel requires files target");
  const onOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, "explorerFiles"),
    [openPreferredTarget],
  );
  const onOpenFileToSide = useCallback(
    (path: string) => openTargetToSide?.({ kind: "file", path }),
    [openTargetToSide],
  );
  const hasDirectory = Boolean(workspaceRoot && workspace?.purpose !== "chat");
  const content =
    hasDirectory && workspaceRoot ? (
      <FileExplorerPane
        viewId={tabId}
        serverId={serverId}
        workspaceId={workspaceId}
        workspaceRoot={workspaceRoot}
        onOpenFile={onOpenFile}
        onOpenFileToSide={openTargetToSide ? onOpenFileToSide : undefined}
        onAddToChat={canAddToChat ? addFile : undefined}
      />
    ) : (
      <View style={styles.centerState}>
        <TreeFolder size={28} />
        <Text style={styles.emptyText}>
          {workspace?.purpose === "chat" ? "未关联工作区" : "目录暂不可用"}
        </Text>
      </View>
    );
  return (
    <View style={styles.container}>
      {host === "files" ? (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{t("panels.files.label")}</Text>
            <HeaderToggleButton
              accessibilityLabel="收起文件树"
              tooltipLabel="收起文件树"
              tooltipKeys={NO_SHORTCUT}
              tooltipSide="bottom"
              onPress={collapseFiles}
            >
              <CollapseFiles size={17} />
            </HeaderToggleButton>
          </View>
          <View style={styles.context}>
            <TreeFolder size={16} />
            <Text numberOfLines={1} style={styles.emptyText}>
              {workspace?.purpose === "chat"
                ? "独立对话"
                : (workspace?.projectDisplayName ?? "工作区")}
            </Text>
          </View>
        </>
      ) : null}
      {content}
    </View>
  );
}

export const filesPanelRegistration = definePanel("files", {
  component: FilesPanel,
  presentation: filesPanelPresentation,
});

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0 },
  header: {
    height: 48,
    flexDirection: "row",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: theme.fontSize.base, color: theme.colors.foreground },
  context: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    gap: 12,
  },
}));
