import { useCallback } from "react";
import { Folder } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { usePaneContext } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
} from "@/workspace/file-open";

const FLEX_FILL_STYLE = { flex: 1 } as const;

function useFilesPanelDescriptor(
  _target: { kind: "files"; workspaceId: string },
  _context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  const { t } = useTranslation();
  const label = t("workspace.tabs.toolsMenu.file");
  return {
    label,
    subtitle: label,
    titleState: "ready",
    icon: Folder,
    statusBucket: null,
  };
}

function FilesPanel() {
  const { serverId, workspaceId, target, openTab } = usePaneContext();
  const workspaceDirectory = useWorkspaceDirectory(serverId, workspaceId);
  invariant(target.kind === "files", "FilesPanel requires files target");

  const handleOpenFile = useCallback(
    (filePath: string) => {
      const location = normalizeWorkspaceFileLocation({ path: filePath });
      if (location) {
        openTab(createWorkspaceFileTabTarget(location));
      }
    },
    [openTab],
  );

  if (!workspaceDirectory) {
    return <View style={FLEX_FILL_STYLE} />;
  }

  return (
    <FileExplorerPane
      serverId={serverId}
      workspaceId={workspaceId}
      workspaceRoot={workspaceDirectory}
      onOpenFile={handleOpenFile}
    />
  );
}

export const filesPanelRegistration: PanelRegistration<"files"> = {
  kind: "files",
  component: FilesPanel,
  useDescriptor: useFilesPanelDescriptor,
};
