import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { useTranslation } from "react-i18next";
import { useStableEvent } from "@/hooks/use-stable-event";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { Pressable, View, Text } from "react-native";
import { useGlobalSearchParams, usePathname } from "expo-router";
import {
  House,
  Clock3,
  Settings,
  PanelLeft,
  PanelRight,
  FolderTree,
  ChevronDown,
  GitBranch,
  Ellipsis,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { HostPicker, HostStatusDotSlot } from "@/components/hosts/host-picker";
import { Button } from "@/components/ui/button";
import { extraMutedIconColorMapping } from "@/components/ui/icon-button-chrome";
import {
  isToolbarLabelTriggerHighlighted,
  ToolbarLabelTriggerIcon,
  toolbarLabelTriggerFrameStyle,
  toolbarLabelTriggerStyle,
  toolbarLabelTriggerTextStyle,
  type ToolbarLabelTriggerState,
} from "@/components/ui/toolbar-label-trigger";
import { WORKBENCH_TITLEBAR_HEIGHT } from "@/constants/layout";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WindowChromeSafeArea } from "@/utils/desktop-window";
import { useHosts } from "@/runtime/host-runtime";
import { usePanelStore } from "@/stores/panel-store";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildNewWorkspaceRoute, parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { workspaceContextLabel } from "./context-label";
import { workbenchModel } from "./runtime";
import type { Theme } from "@/styles/theme";
import { useWorkspace } from "@/stores/session-store-hooks";

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
const ChevronIcon = withUnistyles(ChevronDown);
const BranchIcon = withUnistyles(GitBranch);
const WorkspaceActionsIcon = withUnistyles(Ellipsis);

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
  const { t } = useTranslation();
  const state = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  return (
    <View style={styles.rail} testID="workbench-activity-rail">
      <WorkbenchIconButton
        label={t("workbench.activity.home")}
        Icon={HomeIcon}
        selected={state.activity === "home"}
        onPress={openHome}
        testID="workbench-home"
      />
      <WorkbenchIconButton
        label={t("sidebar.sections.schedules")}
        Icon={ScheduleIcon}
        selected={state.activity === "schedules"}
        onPress={openSchedules}
        testID="workbench-schedules"
      />
      <View style={styles.spacer} />
      <WorkbenchIconButton
        label={t("sidebar.actions.settings")}
        Icon={SettingsIcon}
        selected={state.activity === "settings"}
        onPress={openSettings}
        testID="workbench-settings"
      />
    </View>
  );
}

function useWorkbenchWorkspaceLabels(selection: { serverId: string; workspaceId: string } | null) {
  const { t } = useTranslation();
  const workspace = useWorkspace(selection?.serverId ?? "", selection?.workspaceId ?? "");
  return {
    workspaceLabel: workspaceContextLabel(workspace, t),
    branch: workspace?.purpose === "chat" ? null : workspace?.gitRuntime?.currentBranch,
  };
}

export function WorkbenchTitlebar() {
  const { t } = useTranslation();
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
  const hostPickerOpen = state.hostPickerOpen;
  const hostTriggerStyle = useCallback(
    (pressState: ToolbarLabelTriggerState) =>
      toolbarLabelTriggerStyle({ ...pressState, open: hostPickerOpen }),
    [hostPickerOpen],
  );
  const showsWorkspaceCrumb = Boolean(workspaceLabel) || routeWorkspace !== null;
  useLayoutEffect(() => workbenchModel.applyRoute(route), [route]);
  return (
    <WindowChromeSafeArea placement="inline" style={styles.titlebar}>
      <TitlebarDragRegion />
      <WorkbenchIconButton
        label={t("workbench.titlebar.toggleNavigation")}
        Icon={NavigationIcon}
        onPress={toggleNavigation}
        testID="workbench-toggle-navigation"
      />
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
        <View ref={anchorRef} collapsable={false} style={styles.crumb}>
          <Pressable
            onPress={openHosts}
            accessibilityRole="button"
            accessibilityLabel={t("settings.hostPicker.switchHost")}
            testID="workbench-host-picker"
            style={hostTriggerStyle}
          >
            {(pressState) => {
              const highlighted = isToolbarLabelTriggerHighlighted({
                ...pressState,
                open: hostPickerOpen,
              });
              return (
                <>
                  {selectedHost ? (
                    <ToolbarLabelTriggerIcon>
                      <HostStatusDotSlot serverId={selectedHost.serverId} />
                    </ToolbarLabelTriggerIcon>
                  ) : null}
                  <Text style={toolbarLabelTriggerTextStyle(highlighted)} numberOfLines={1}>
                    {selectedHost?.label ?? t("workbench.context.hostFallback")}
                  </Text>
                  <ToolbarLabelTriggerIcon>
                    <ChevronIcon size={12} uniProps={extraMutedIconColorMapping} />
                  </ToolbarLabelTriggerIcon>
                </>
              );
            }}
          </Pressable>
        </View>
      </HostPicker>
      {workspaceLabel ? <Text style={styles.separator}>/</Text> : null}
      {showsWorkspaceCrumb ? (
        // The actions button belongs to the workspace name, so it sits flush against the name's
        // frame instead of a full titlebar gap away.
        <View style={styles.workspaceCrumb}>
          {workspaceLabel ? (
            <View style={[toolbarLabelTriggerFrameStyle(), styles.crumb]}>
              <Text numberOfLines={1} style={toolbarLabelTriggerTextStyle(false)}>
                {workspaceLabel}
              </Text>
            </View>
          ) : null}
          {routeWorkspace ? (
            <WorkbenchIconButton
              label={t("workbench.titlebar.workspaceActions")}
              Icon={WorkspaceActionsIcon}
              selected={state.workspaceActionsVisible}
              onPress={workbenchModel.toggleWorkspaceActions}
              testID="workbench-workspace-actions"
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.spacer} />
      {branch ? (
        <View style={styles.branch}>
          <BranchIcon size={16} uniProps={foreground} />
          <Text numberOfLines={1} style={styles.branchText}>
            {branch}
          </Text>
        </View>
      ) : null}
      {state.persistenceError ? (
        <Button
          variant="ghost"
          size="sm"
          onPress={workbenchModel.retryPersistence}
          accessibilityLabel={t("workbench.titlebar.saveLayoutFailed", {
            error: state.persistenceError,
          })}
        >
          {t("workbench.titlebar.retrySaveLayout")}
        </Button>
      ) : null}
      {state.activity === "home" ? (
        <>
          <WorkbenchIconButton
            label={t("workbench.titlebar.toggleContent")}
            Icon={ContentIcon}
            selected={state.preferences.contentVisible}
            onPress={toggleContent}
            testID="workbench-toggle-content"
          />
          <WorkbenchIconButton
            label={t("workbench.titlebar.toggleFiles")}
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
    height: WORKBENCH_TITLEBAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  separator: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  crumb: { maxWidth: 240, minWidth: 0, flexShrink: 1 },
  workspaceCrumb: { flexDirection: "row", alignItems: "center", minWidth: 0, flexShrink: 1 },
  rail: { width: 52, alignItems: "center", paddingVertical: 8, gap: 8 },
  iconButton: { width: 32, height: 32, borderRadius: 8 },
  spacer: { flex: 1 },
  branch: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 240, marginRight: 10 },
  branchText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted, flexShrink: 1 },
  selected: { backgroundColor: theme.colors.workbenchSelected },
}));
