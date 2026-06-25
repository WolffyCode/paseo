import { GitCompare } from "lucide-react-native";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { GitDiffPane } from "@/git/diff-pane";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import type { PanelDescriptor, PanelRegistration } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";

const FLEX_FILL_STYLE = { flex: 1 } as const;

function useReviewPanelDescriptor(
  _target: { kind: "review"; workspaceId: string },
  _context: { serverId: string; workspaceId: string },
): PanelDescriptor {
  const { t } = useTranslation();
  const label = t("workspace.tabs.toolsMenu.review");
  return {
    label,
    subtitle: label,
    titleState: "ready",
    icon: GitCompare,
    statusBucket: null,
  };
}

function ReviewPanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  const { isWorkspaceFocused } = usePaneFocus();
  const workspaceDirectory = useWorkspaceDirectory(serverId, workspaceId);
  invariant(target.kind === "review", "ReviewPanel requires review target");

  if (!workspaceDirectory) {
    return <View style={FLEX_FILL_STYLE} />;
  }

  return (
    <GitDiffPane
      serverId={serverId}
      workspaceId={workspaceId}
      cwd={workspaceDirectory}
      enabled={isWorkspaceFocused}
    />
  );
}

export const reviewPanelRegistration: PanelRegistration<"review"> = {
  kind: "review",
  component: ReviewPanel,
  useDescriptor: useReviewPanelDescriptor,
};
