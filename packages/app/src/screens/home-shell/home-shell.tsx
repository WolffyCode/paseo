import { useCallback, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { usePathname } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { LeftSidebar } from "@/components/left-sidebar";
import { SettingsSidebar } from "@/screens/settings-codepilot/settings-sidebar";
import { isSettingsPathname } from "@/utils/host-routes";
import {
  type ActiveWorkspaceSelection,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { useShellLayoutStore } from "@/stores/shell-layout-store";
import {
  selectTopBarModel,
  selectVisibleRegions,
  type ShellRegion,
  type ShellRoute,
} from "@/stores/shell-regions";
import { isRightToolPanelOpen, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { RegionFrame } from "./region-frame";
import { RegionGutter } from "./region-gutter";
import { UnifiedTopBar } from "./unified-top-bar";

// The desktop home shell — the window-wide top bar plus the row of floating cards
// (left sidebar / center canvas / right tools / file tree). It replaces the old
// `[LeftSidebar | children]` desktop layout in app/_layout.tsx. The center card
// always holds the route `children`; the left + file-tree cards are owned here and
// driven by shell-layout-store. Pre-connection (`chromeEnabled` false) it renders
// the bare route so onboarding/splash keep their full-bleed layout.
interface HomeShellProps {
  children: ReactNode;
  selectedAgentId: string | undefined;
  chromeEnabled: boolean;
}

// The workspace identity used to key per-workspace remembered widths. Matches the
// serverId:workspaceId pair the rest of the app scopes workspace state by.
function workspaceKeyOf(selection: ActiveWorkspaceSelection | null): string | null {
  return selection ? `${selection.serverId}:${selection.workspaceId}` : null;
}

export function HomeShell({ children, selectedAgentId, chromeEnabled }: HomeShellProps) {
  const selection = useActiveWorkspaceSelection();
  const workspaceKey = workspaceKeyOf(selection);
  const directory = useWorkspaceDirectory(
    selection?.serverId ?? null,
    selection?.workspaceId ?? null,
  );

  const leftOpen = useShellLayoutStore((state) => state.leftOpen);
  const rightOpen = useShellLayoutStore((state) => state.rightOpen);
  const fileTreeOpen = useShellLayoutStore((state) => state.fileTreeOpen);
  const widthByRegion = useShellLayoutStore((state) => state.widthByRegion);
  const toggleRegion = useShellLayoutStore((state) => state.toggleRegion);

  // The right toggle drives the workspace's existing tool-panel subsystem in place
  // (its standalone right card is the deferred full split). Reading + dispatching one
  // truth (workspace-layout-store) keeps the top-bar toggle, keyboard shortcut and the
  // panel's own controls in sync without fighting each other.
  const rightToolOpen = useWorkspaceLayoutStore((state) => {
    if (!workspaceKey) {
      return false;
    }
    const layout = state.layoutByWorkspace[workspaceKey];
    if (!layout) {
      return false;
    }
    const collapsed = state.rightToolPanelCollapsedByWorkspace[workspaceKey] ?? false;
    return isRightToolPanelOpen(layout) && !collapsed;
  });
  const openRightTool = useWorkspaceLayoutStore((state) => state.openRightToolPanel);
  const closeRightTool = useWorkspaceLayoutStore((state) => state.closeRightToolPanel);
  const handleToggleRegion = useCallback(
    (region: ShellRegion) => {
      if (region !== "right") {
        toggleRegion(region);
        return;
      }
      if (!workspaceKey) {
        return;
      }
      if (rightToolOpen) {
        closeRightTool(workspaceKey);
      } else {
        openRightTool(workspaceKey);
      }
    },
    [toggleRegion, workspaceKey, rightToolOpen, closeRightTool, openRightTool],
  );

  // Settings renders inside the same shell: the left card swaps to the settings nav and
  // the center to the route's settings content, while the frame (top bar + left width)
  // stays a shared constant. The carried workspaceKey keeps the left width from jumping.
  const pathname = usePathname();
  const isSettings = isSettingsPathname(pathname);
  const route = useMemo<ShellRoute>(
    () => ({
      showsShell: chromeEnabled,
      workspaceKey,
      content: isSettings ? "settings" : "workspace",
    }),
    [chromeEnabled, workspaceKey, isSettings],
  );
  const visible = useMemo(
    () => selectVisibleRegions({ leftOpen, rightOpen, fileTreeOpen, widthByRegion }, route),
    [leftOpen, rightOpen, fileTreeOpen, widthByRegion, route],
  );
  const projectName = useMemo(() => {
    if (!directory) {
      return null;
    }
    const trimmed = directory.replace(/\/+$/, "");
    const lastSlash = trimmed.lastIndexOf("/");
    return (lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed) || null;
  }, [directory]);
  const topBarModel = useMemo(
    () =>
      selectTopBarModel({
        route,
        conversationTitle: null,
        projectName,
        branch: null,
        // The right toggle reflects the workspace tool panel's real open state.
        layout: { leftOpen, rightOpen: rightToolOpen, fileTreeOpen },
      }),
    [route, projectName, leftOpen, rightToolOpen, fileTreeOpen],
  );

  if (!chromeEnabled) {
    return <View style={styles.window}>{children}</View>;
  }

  return (
    <View style={styles.window}>
      <UnifiedTopBar model={topBarModel} onToggleRegion={handleToggleRegion} />
      <View style={styles.row}>
        {visible.left != null ? (
          <RegionFrame kind="left" width={visible.left}>
            {isSettings ? <SettingsSidebar /> : <LeftSidebar selectedAgentId={selectedAgentId} />}
          </RegionFrame>
        ) : null}
        {visible.left != null && workspaceKey != null ? (
          <RegionGutter region="left" workspaceKey={workspaceKey} currentWidth={visible.left} />
        ) : null}
        <RegionFrame kind="main">{children}</RegionFrame>
        {visible.fileTree != null && workspaceKey != null ? (
          <RegionGutter
            region="fileTree"
            workspaceKey={workspaceKey}
            currentWidth={visible.fileTree}
          />
        ) : null}
        {visible.fileTree != null && selection != null && directory != null ? (
          <RegionFrame kind="fileTree" width={visible.fileTree}>
            <FileExplorerPane
              serverId={selection.serverId}
              workspaceId={selection.workspaceId}
              workspaceRoot={directory}
            />
          </RegionFrame>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  window: {
    flex: 1,
    flexDirection: "column",
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    backgroundColor: theme.colors.surfaceShell,
  },
  row: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
  },
}));
