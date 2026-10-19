import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { useToast } from "@/contexts/toast-context";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import type { Theme } from "@/styles/theme";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";

interface OpenInFileManagerMenuItemProps {
  /** The host the path lives on. Only the desktop's own daemon shares this machine's disk. */
  serverId: string;
  path?: string | null;
  testID: string;
  surface?: "context" | "dropdown";
}

const ThemedFolderOpen = withUnistyles(FolderOpen);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const leadingIcon = <ThemedFolderOpen size={14} uniProps={foregroundMutedColorMapping} />;

export function OpenInFileManagerMenuItem({
  serverId,
  path,
  testID,
  surface = "dropdown",
}: OpenInFileManagerMenuItemProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const workspacePath = path?.trim() ?? "";
  const { targets } = useDesktopOpenTargets({
    isLocalExecution: isLocalDaemon && workspacePath.length > 0,
  });
  const fileManagerTarget = targets.find((target) => target.kind === "file-manager");

  const openInFileManager = useCallback(() => {
    if (!fileManagerTarget || workspacePath.length === 0) return;
    void openDesktopTarget({
      editorId: fileManagerTarget.id,
      workspacePath,
    }).catch((error) => {
      console.warn("[open-in-file-manager] open failed", error);
      toast.error(t("sidebar.project.actions.openFolderFailed"));
    });
  }, [fileManagerTarget, t, toast, workspacePath]);

  if (!isLocalDaemon || !fileManagerTarget || workspacePath.length === 0) {
    return null;
  }

  const label = t("workspace.fileActions.openIn", { target: fileManagerTarget.label });
  if (surface === "context") {
    return (
      <ContextMenuItem testID={testID} leading={leadingIcon} onSelect={openInFileManager}>
        {label}
      </ContextMenuItem>
    );
  }
  return (
    <DropdownMenuItem testID={testID} leading={leadingIcon} onSelect={openInFileManager}>
      {label}
    </DropdownMenuItem>
  );
}
