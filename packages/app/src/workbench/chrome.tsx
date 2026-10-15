import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ComponentType } from "react";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { View, Text } from "react-native";
import { useGlobalSearchParams, usePathname } from "expo-router";
import {
  House,
  Clock3,
  Settings,
  PanelLeft,
  PanelRight,
  FolderTree,
  Monitor,
  ChevronDown,
  Folder,
  GitBranch,
  Ellipsis,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { HostPicker } from "@/components/hosts/host-picker";
import { Button } from "@/components/ui/button";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WindowChromeSafeArea } from "@/utils/desktop-window";
import { useHosts } from "@/runtime/host-runtime";
import { usePanelStore } from "@/stores/panel-store";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute, parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { workbenchModel } from "./runtime";
import type { Theme } from "@/styles/theme";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useHostRuntimeConnectionStatus } from "@/runtime/host-runtime";

const NO_KEYS: ShortcutKey[] = [];
const SELECTED = { selected: true };
const UNSELECTED = { selected: false };
const openHome = () => workbenchModel.selectActivity("home");
const openSchedules = () => workbenchModel.selectActivity("schedules");
const openSettings = () => workbenchModel.selectActivity("settings");
const openHosts = () => workbenchModel.setHostPickerOpen(true);
const foreground = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const HomeIcon = withUnistyles(House);
const ScheduleIcon = withUnistyles(Clock3);
const SettingsIcon = withUnistyles(Settings);
const NavigationIcon = withUnistyles(PanelLeft);
const ContentIcon = withUnistyles(PanelRight);
const FilesIcon = withUnistyles(FolderTree);
const HostIcon = withUnistyles(Monitor);
const ChevronIcon = withUnistyles(ChevronDown);
const FolderIcon = withUnistyles(Folder);
const BranchIcon = withUnistyles(GitBranch);
const WorkspaceActionsIcon = withUnistyles(Ellipsis);

export function WorkbenchConversationContext({
  serverId,
  workspaceId,
  footer = false,
}: {
  serverId: string;
  workspaceId: string;
  footer?: boolean;
}) {
  const workspace = useWorkspace(serverId, workspaceId);
  const hosts = useHosts();
  const status = useHostRuntimeConnectionStatus(serverId);
  const label =
    workspace?.purpose === "chat" ? "独立对话" : (workspace?.projectDisplayName ?? "工作区");
  const host = hosts.find((entry) => entry.serverId === serverId);
  return (
    <View style={footer ? styles.contextFooter : styles.contextHeader}>
      {footer ? (
        <>
          <View style={[styles.connectionDot, status === "online" && styles.connected]} />
          <Text numberOfLines={1} style={styles.contextText}>
            {host?.label ?? "主机"}
          </Text>
          <View style={styles.spacer} />
          <FolderIcon size={15} uniProps={foreground} />
          <Text numberOfLines={1} style={styles.contextText}>
            {workspace?.purpose === "chat" ? "未关联目录" : label}
          </Text>
        </>
      ) : (
        <>
          <Text numberOfLines={1} style={styles.contextText}>
            {label}
          </Text>
          <View style={styles.spacer} />
          <FolderIcon size={17} uniProps={foreground} />
        </>
      )}
    </View>
  );
}

export function WorkbenchIconButton({
  label,
  onPress,
  Icon,
  selected = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  Icon: ComponentType<{ size: number; uniProps: typeof foreground }>;
  selected?: boolean;
  testID: string;
}) {
  const style = useMemo(() => [styles.iconButton, selected && styles.selected], [selected]);
  return (
    <HeaderToggleButton
      accessibilityLabel={label}
      accessibilityState={selected ? SELECTED : UNSELECTED}
      tooltipLabel={label}
      tooltipKeys={NO_KEYS}
      tooltipSide="bottom"
      onPress={onPress}
      testID={testID}
      style={style}
    >
      <Icon size={18} uniProps={foreground} />
    </HeaderToggleButton>
  );
}

export function WorkbenchActivityRail() {
  const state = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  return (
    <View style={styles.rail} testID="workbench-activity-rail">
      <WorkbenchIconButton
        label="主页"
        Icon={HomeIcon}
        selected={state.activity === "home"}
        onPress={openHome}
        testID="workbench-home"
      />
      <WorkbenchIconButton
        label="定时任务"
        Icon={ScheduleIcon}
        selected={state.activity === "schedules"}
        onPress={openSchedules}
        testID="workbench-schedules"
      />
      <View style={styles.spacer} />
      <WorkbenchIconButton
        label="设置"
        Icon={SettingsIcon}
        selected={state.activity === "settings"}
        onPress={openSettings}
        testID="workbench-settings"
      />
    </View>
  );
}

function useWorkbenchWorkspaceLabels(selection: { serverId: string; workspaceId: string } | null) {
  const workspace = useWorkspace(selection?.serverId ?? "", selection?.workspaceId ?? "");
  return {
    workspaceLabel: workspace?.purpose === "chat" ? "独立对话" : workspace?.projectDisplayName,
    branch: workspace?.purpose === "chat" ? null : workspace?.gitRuntime?.currentBranch,
  };
}

export function WorkbenchTitlebar() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{
    serverId?: string;
    draftId?: string;
    dir?: string;
    name?: string;
    projectId?: string;
  }>();
  const route =
    pathname === "/new"
      ? buildNewWorkspaceRoute({
          serverId: params.serverId,
          draftId: params.draftId,
          sourceDirectory: params.dir,
          displayName: params.name,
          projectId: params.projectId,
        })
      : pathname;
  const state = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  const hosts = useHosts();
  const lastWorkspace = useLastWorkspaceSelection();
  const routeWorkspace = parseHostWorkspaceRouteFromPathname(pathname);
  const selection = routeWorkspace ?? lastWorkspace;
  const { workspaceLabel, branch } = useWorkbenchWorkspaceLabels(selection);
  const selectedHost =
    hosts.find((host) => host.serverId === (params.serverId ?? selection?.serverId)) ?? hosts[0];
  const anchorRef = useRef<View>(null);
  const toggleNavigation = usePanelStore((model) => model.toggleDesktopAgentList);
  const toggleContent = useStableEvent(() =>
    workbenchModel.setRegionVisible("content", !state.preferences.contentVisible),
  );
  const toggleFiles = useStableEvent(() =>
    workbenchModel.setRegionVisible("files", !state.preferences.filesVisible),
  );
  useLayoutEffect(() => workbenchModel.applyRoute(route), [route]);
  return (
    <WindowChromeSafeArea placement="inline" style={styles.titlebar}>
      <TitlebarDragRegion />
      <WorkbenchIconButton
        label="展开或收起导航"
        Icon={NavigationIcon}
        onPress={toggleNavigation}
        testID="workbench-toggle-navigation"
      />
      <Text style={styles.brand}>Helm</Text>
      <HostPicker
        hosts={hosts}
        value={selectedHost?.serverId ?? ""}
        onSelect={workbenchModel.selectHost}
        open={state.hostPickerOpen}
        onOpenChange={workbenchModel.setHostPickerOpen}
        anchorRef={anchorRef}
        showActiveConnection
        searchable
        includeAddHost
        onAddHost={workbenchModel.addHost}
        onOpenHostSettings={workbenchModel.openHostSettings}
      >
        <View ref={anchorRef} collapsable={false}>
          <Button
            variant="ghost"
            size="sm"
            onPress={openHosts}
            accessibilityLabel="切换主机"
            testID="workbench-host-picker"
          >
            <HostIcon size={16} uniProps={foreground} />
            <Text style={styles.hostLabel} numberOfLines={1}>
              {selectedHost?.label ?? "主机"}
            </Text>
            <ChevronIcon size={12} uniProps={foreground} />
          </Button>
        </View>
      </HostPicker>
      {workspaceLabel ? (
        <>
          <Text style={styles.hostLabel}>/</Text>
          <Text numberOfLines={1} style={styles.workspaceLabel}>
            {workspaceLabel}
          </Text>
        </>
      ) : null}
      {routeWorkspace ? (
        <WorkbenchIconButton
          label="工作区操作"
          Icon={WorkspaceActionsIcon}
          selected={state.workspaceActionsVisible}
          onPress={workbenchModel.toggleWorkspaceActions}
          testID="workbench-workspace-actions"
        />
      ) : null}
      <View style={styles.spacer} />
      {branch ? (
        <View style={styles.branch}>
          <BranchIcon size={16} uniProps={foreground} />
          <Text numberOfLines={1} style={styles.contextText}>
            {branch}
          </Text>
        </View>
      ) : null}
      {state.persistenceError ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={workbenchModel.retryPersistence}
          accessibilityLabel={`保存布局失败：${state.persistenceError}。重试`}
        >
          重试保存布局
        </Button>
      ) : null}
      {state.activity === "home" ? (
        <>
          <WorkbenchIconButton
            label="展开或收起内容栏"
            Icon={ContentIcon}
            selected={state.preferences.contentVisible}
            onPress={toggleContent}
            testID="workbench-toggle-content"
          />
          <WorkbenchIconButton
            label="展开或收起文件树"
            Icon={FilesIcon}
            selected={state.preferences.filesVisible}
            onPress={toggleFiles}
            testID="workbench-toggle-files"
          />
        </>
      ) : null}
    </WindowChromeSafeArea>
  );
}

const styles = StyleSheet.create((theme) => ({
  titlebar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  brand: { color: theme.colors.foreground, fontSize: theme.fontSize.base, fontWeight: "500" },
  hostLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, maxWidth: 200 },
  rail: { width: 52, alignItems: "center", paddingVertical: 8, gap: 8 },
  iconButton: { width: 32, height: 32, borderRadius: 8 },
  spacer: { flex: 1 },
  workspaceLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    maxWidth: 240,
  },
  branch: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 240, marginRight: 10 },
  contextHeader: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 6,
  },
  contextFooter: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 6,
  },
  contextText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted, flexShrink: 1 },
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  connected: { backgroundColor: theme.colors.statusSuccess },
  selected: { backgroundColor: theme.colors.workbenchSelected },
}));
