import { router, usePathname } from "expo-router";
import { Search, Settings, SquarePen, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet as RNStyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { HostSwitcherPill } from "@/components/sidebar/host-switcher-pill";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { SidebarWindowChrome } from "@/components/sidebar/sidebar-window-chrome";
import { ConversationTree } from "@/conversation-tree/render";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useSidebarAnimation } from "@/contexts/sidebar-animation-context";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useSidebarShortcutModel } from "@/hooks/use-sidebar-shortcut-model";
import {
  type SidebarProjectEntry,
  useSidebarWorkspacesList,
} from "@/hooks/use-sidebar-workspaces-list";
import { useConversationHistoryStore } from "@/stores/conversation-history-store";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import { useSidebarPinsStore } from "@/stores/sidebar-pins-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useHosts } from "@/runtime/host-runtime";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  usePanelStore,
} from "@/stores/panel-store";
import { resolveActiveHost } from "@/utils/active-host";
import { canCloseLeftSidebarGesture } from "@/utils/sidebar-animation-state";
import { buildHostNewWorkspaceRoute, buildSettingsRoute } from "@/utils/host-routes";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";
import { SidebarWorkspaceList } from "./sidebar-workspace-list";

const MIN_CHAT_WIDTH = 400;

type SidebarShortcutModel = ReturnType<typeof useSidebarShortcutModel>;
type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

interface LeftSidebarProps {
  selectedAgentId?: string;
}

interface ProjectsHeaderModel {
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
  onSelectFolder: () => void;
}

interface SidebarSharedProps {
  theme: SidebarTheme;
  activeServerId: string | null;
  pinnedProjects: SidebarProjectEntry[];
  unpinnedProjects: SidebarProjectEntry[];
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isManualRefresh: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: SidebarShortcutModel["collapsedProjectKeys"];
  shortcutIndexByWorkspaceKey: SidebarShortcutModel["shortcutIndexByWorkspaceKey"];
  toggleProjectCollapsed: SidebarShortcutModel["toggleProjectCollapsed"];
  allProjectsCollapsed: boolean;
  handleToggleCollapseAll: () => void;
  handleRefresh: () => void;
  handleNewWorkspaceNavigate: () => void;
  handleOpenCommandCenter: () => void;
  handleOpenProject: () => void;
  handleSettings: () => void;
  labels: SidebarLabels;
  newWorkspaceKeys: ShortcutKey[][] | null;
  commandCenterKeys: ShortcutKey[][] | null;
}

interface SidebarLabels {
  newConversation: string;
  search: string;
  settings: string;
  closeSidebar: string;
}

interface MobileSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  insetsBottom: number;
  isOpen: boolean;
  closeSidebar: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  isOpen: boolean;
}

export const LeftSidebar = memo(function LeftSidebar({
  selectedAgentId: _selectedAgentId,
}: LeftSidebarProps) {
  void _selectedAgentId;

  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const isOpen = usePanelStore((state) =>
    selectIsAgentListOpen(state, { isCompact: isCompactLayout }),
  );
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const pathname = usePathname();
  const daemons = useHosts();
  const activeDaemon = useMemo(
    () => resolveActiveHost({ hosts: daemons, pathname }),
    [daemons, pathname],
  );
  const activeServerId = activeDaemon?.serverId ?? null;

  // Record visited conversation routes so the window-chrome ‹ › arrows have a history to replay
  // (desktop only, workspace routes only — R2, intentionally minimal).
  const visitConversationRoute = useConversationHistoryStore((state) => state.visit);
  useEffect(() => {
    if (!isCompactLayout && pathname.includes("/workspace/")) {
      visitConversationRoute(pathname);
    }
  }, [pathname, isCompactLayout, visitConversationRoute]);

  const { projects, isInitialLoad, isRevalidating, refreshAll } = useSidebarWorkspacesList({
    serverId: activeServerId,
    enabled: isCompactLayout || isOpen,
  });
  const {
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
    setAllProjectsCollapsed,
  } = useSidebarShortcutModel({ projects });

  const allProjectsCollapsed = useMemo(
    () =>
      projects.length > 0 &&
      projects.every((project) => collapsedProjectKeys.has(project.projectKey)),
    [projects, collapsedProjectKeys],
  );
  const handleToggleCollapseAll = useCallback(() => {
    setAllProjectsCollapsed(
      projects.map((project) => project.projectKey),
      !allProjectsCollapsed,
    );
  }, [projects, allProjectsCollapsed, setAllProjectsCollapsed]);

  // Pinning a project moves the whole folder (and its children) into the "置顶"
  // section above "项目". We split here so both groups share one scroll container.
  const pinnedTargets = useSidebarPinsStore((state) =>
    activeServerId ? state.pinnedByServerId[activeServerId] : undefined,
  );
  const { pinnedProjects, unpinnedProjects } = useMemo(() => {
    if (!pinnedTargets || pinnedTargets.length === 0) {
      return { pinnedProjects: [], unpinnedProjects: projects };
    }
    // Pin order is authoritative for the pinned group; preserve list order for the rest.
    const projectByKey = new Map(projects.map((project) => [project.projectKey, project]));
    const pinnedKeys = new Set<string>();
    const pinned: SidebarProjectEntry[] = [];
    for (const target of pinnedTargets) {
      if (target.kind !== "project") continue;
      const project = projectByKey.get(target.projectKey);
      if (project) {
        pinned.push(project);
        pinnedKeys.add(target.projectKey);
      }
    }
    const unpinned = projects.filter((project) => !pinnedKeys.has(project.projectKey));
    return { pinnedProjects: pinned, unpinnedProjects: unpinned };
  }, [projects, pinnedTargets]);

  const groupMode = useSidebarViewStore((state) =>
    activeServerId ? state.getGroupMode(activeServerId) : "project",
  );

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenProjectPicker(activeServerId);

  const handleOpenProjectMobile = useCallback(() => {
    showMobileAgent();
    void openProjectPicker();
  }, [showMobileAgent, openProjectPicker]);

  const handleOpenProjectDesktop = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleNewWorkspaceNavigate = useCallback(() => {
    if (!activeServerId) return;
    router.navigate(buildHostNewWorkspaceRoute(activeServerId));
  }, [activeServerId]);

  const handleSettingsMobile = useCallback(() => {
    showMobileAgent();
    router.push(buildSettingsRoute());
  }, [showMobileAgent]);

  const handleSettingsDesktop = useCallback(() => {
    router.push(buildSettingsRoute());
  }, []);

  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const handleOpenCommandCenter = useCallback(
    () => setCommandCenterOpen(true),
    [setCommandCenterOpen],
  );

  const newWorkspaceKeys = useShortcutKeys("new-workspace");
  const commandCenterKeys = useShortcutKeys("toggle-command-center");

  const labels = useMemo(
    (): SidebarLabels => ({
      newConversation: t("sidebar.actions.newConversation"),
      search: t("sidebar.actions.search"),
      settings: t("sidebar.actions.settings"),
      closeSidebar: t("sidebar.actions.closeSidebar"),
    }),
    [t],
  );

  const sharedProps = {
    theme,
    activeServerId,
    pinnedProjects,
    unpinnedProjects,
    isInitialLoad,
    isRevalidating,
    isManualRefresh,
    groupMode,
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
    allProjectsCollapsed,
    handleToggleCollapseAll,
    handleRefresh,
    labels,
    newWorkspaceKeys,
    commandCenterKeys,
  };

  if (isCompactLayout) {
    return (
      <MobileSidebar
        {...sharedProps}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isOpen={isOpen}
        closeSidebar={showMobileAgent}
        handleNewWorkspaceNavigate={handleNewWorkspaceNavigate}
        handleOpenCommandCenter={handleOpenCommandCenter}
        handleOpenProject={handleOpenProjectMobile}
        handleSettings={handleSettingsMobile}
      />
    );
  }

  return (
    <DesktopSidebar
      {...sharedProps}
      insetsTop={insets.top}
      isOpen={isOpen}
      handleNewWorkspaceNavigate={handleNewWorkspaceNavigate}
      handleOpenCommandCenter={handleOpenCommandCenter}
      handleOpenProject={handleOpenProjectDesktop}
      handleSettings={handleSettingsDesktop}
    />
  );
});

function SidebarFooter({
  settingsLabel,
  onSettings,
}: {
  settingsLabel: string;
  onSettings: () => void;
}) {
  return (
    <View style={styles.sidebarFooter}>
      <SidebarHeaderRow
        icon={Settings}
        label={settingsLabel}
        onPress={onSettings}
        testID="sidebar-settings"
        variant="compact"
      />
    </View>
  );
}

function MobileSidebar({
  theme,
  activeServerId,
  pinnedProjects,
  unpinnedProjects,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  allProjectsCollapsed,
  handleToggleCollapseAll,
  handleRefresh,
  newWorkspaceKeys,
  commandCenterKeys,
  handleNewWorkspaceNavigate,
  handleOpenCommandCenter,
  handleOpenProject,
  handleSettings,
  labels,
  insetsTop,
  insetsBottom,
  isOpen,
  closeSidebar,
}: MobileSidebarProps) {
  const {
    translateX,
    backdropOpacity,
    windowWidth,
    animateToOpen,
    animateToClose,
    overlayVisible,
    isGesturing,
    mobilePanelState,
    gestureAnimatingRef,
    closeGestureRef,
  } = useSidebarAnimation();
  const closeTouchStartX = useSharedValue(0);
  const closeTouchStartY = useSharedValue(0);

  const handleCloseFromGesture = useCallback(() => {
    gestureAnimatingRef.current = true;
    closeSidebar();
  }, [closeSidebar, gestureAnimatingRef]);

  const handleSearch = useCallback(() => {
    translateX.value = -windowWidth;
    backdropOpacity.value = 0;
    closeSidebar();
    handleOpenCommandCenter();
  }, [backdropOpacity, closeSidebar, handleOpenCommandCenter, translateX, windowWidth]);

  const handleWorkspacePress = useCallback(() => {
    closeSidebar();
  }, [closeSidebar]);

  const handleNewWorkspace = useCallback(() => {
    closeSidebar();
    handleNewWorkspaceNavigate();
  }, [closeSidebar, handleNewWorkspaceNavigate]);

  const projectsHeader = useMemo(
    (): ProjectsHeaderModel => ({
      allCollapsed: allProjectsCollapsed,
      onToggleCollapseAll: handleToggleCollapseAll,
      onSelectFolder: handleOpenProject,
    }),
    [allProjectsCollapsed, handleToggleCollapseAll, handleOpenProject],
  );

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(closeGestureRef)
        .enabled(true)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (!touch) {
            return;
          }
          closeTouchStartX.value = touch.absoluteX;
          closeTouchStartY.value = touch.absoluteY;
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }

          const deltaX = touch.absoluteX - closeTouchStartX.value;
          const deltaY = touch.absoluteY - closeTouchStartY.value;
          const absDeltaX = Math.abs(deltaX);
          const absDeltaY = Math.abs(deltaY);

          if (!canCloseLeftSidebarGesture(mobilePanelState.value)) {
            stateManager.fail();
            return;
          }

          if (deltaX >= 10) {
            stateManager.fail();
            return;
          }
          if (absDeltaY > 10 && absDeltaY > absDeltaX) {
            stateManager.fail();
            return;
          }
          if (deltaX <= -15 && absDeltaX > absDeltaY) {
            stateManager.activate();
          }
        })
        .onStart(() => {
          isGesturing.value = true;
        })
        .onUpdate((event) => {
          const newTranslateX = Math.min(0, Math.max(-windowWidth, event.translationX));
          translateX.value = newTranslateX;
          backdropOpacity.value = interpolate(
            newTranslateX,
            [-windowWidth, 0],
            [0, 1],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((event) => {
          isGesturing.value = false;
          const shouldClose = event.translationX < -windowWidth / 3 || event.velocityX < -500;
          if (shouldClose) {
            animateToClose();
            runOnJS(handleCloseFromGesture)();
          } else {
            animateToOpen();
          }
        })
        .onFinalize(() => {
          isGesturing.value = false;
        }),
    [
      closeGestureRef,
      closeTouchStartX,
      closeTouchStartY,
      isGesturing,
      mobilePanelState,
      windowWidth,
      translateX,
      backdropOpacity,
      animateToClose,
      animateToOpen,
      handleCloseFromGesture,
    ],
  );

  const mobileSidebarInsetStyle = useMemo(
    () => ({ width: windowWidth, paddingTop: insetsTop, paddingBottom: insetsBottom }),
    [windowWidth, insetsTop, insetsBottom],
  );

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  let overlayPointerEvents: "auto" | "none" | "box-none";
  if (!isWeb) overlayPointerEvents = "box-none";
  else if (isOpen) overlayPointerEvents = "auto";
  else overlayPointerEvents = "none";

  const backdropStyle = useMemo(
    () => [
      staticStyles.backdrop,
      backdropAnimatedStyle,
      // pointerEvents is React-owned, not worklet-owned: Reanimated never
      // touches it, so a stale animated-prop revert can't wedge an invisible
      // tap-eating backdrop.
      { pointerEvents: isOpen ? ("auto" as const) : ("none" as const) },
    ],
    [backdropAnimatedStyle, isOpen],
  );
  const mobileSidebarStyle = useMemo(
    () => [
      staticStyles.mobileSidebar,
      mobileSidebarInsetStyle,
      sidebarAnimatedStyle,
      { backgroundColor: theme.colors.surfaceSidebar },
    ],
    [mobileSidebarInsetStyle, sidebarAnimatedStyle, theme.colors.surfaceSidebar],
  );
  // display is React-owned on the plain wrapper View (no animated styles), so
  // a hidden overlay stays hidden no matter what Reanimated's Fabric overlay
  // reverts the panel transform to after a heavy commit (reanimated#9635).
  const overlayStyle = useMemo(
    () => [
      StyleSheet.absoluteFillObject,
      { display: overlayVisible ? ("flex" as const) : ("none" as const) },
    ],
    [overlayVisible],
  );

  return (
    <View style={overlayStyle} pointerEvents={overlayPointerEvents}>
      <Animated.View style={backdropStyle} />

      <GestureDetector gesture={closeGesture} touchAction="pan-y">
        <Animated.View style={mobileSidebarStyle} pointerEvents="auto">
          <View style={styles.sidebarContent} pointerEvents="auto">
            <View style={styles.sidebarHeaderGroup}>
              <SidebarHeaderRow
                icon={SquarePen}
                label={labels.newConversation}
                onPress={handleNewWorkspace}
                testID="sidebar-global-new-workspace"
                variant="compact"
                shortcutKeys={newWorkspaceKeys}
              />
              <SidebarHeaderRow
                icon={Search}
                label={labels.search}
                onPress={handleSearch}
                testID="sidebar-search"
                variant="compact"
                shortcutKeys={commandCenterKeys}
              />
            </View>
            <Pressable
              style={styles.mobileCloseButton}
              onPress={closeSidebar}
              testID="sidebar-close"
              nativeID="sidebar-close"
              accessible
              accessibilityRole="button"
              accessibilityLabel={labels.closeSidebar}
              hitSlop={8}
            >
              {({ hovered, pressed }) => (
                <X
                  size={theme.iconSize.md}
                  color={
                    hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                  }
                />
              )}
            </Pressable>

            {isInitialLoad ? (
              <SidebarAgentListSkeleton />
            ) : (
              <SidebarWorkspaceList
                serverId={activeServerId}
                collapsedProjectKeys={collapsedProjectKeys}
                onToggleProjectCollapsed={toggleProjectCollapsed}
                shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                groupMode={groupMode}
                pinnedProjects={pinnedProjects}
                unpinnedProjects={unpinnedProjects}
                projectsHeader={projectsHeader}
                isRefreshing={isManualRefresh && isRevalidating}
                onRefresh={handleRefresh}
                onWorkspacePress={handleWorkspacePress}
                onAddProject={handleOpenProject}
                parentGestureRef={closeGestureRef}
              />
            )}

            <SidebarFooter settingsLabel={labels.settings} onSettings={handleSettings} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function DesktopSidebar({
  activeServerId,
  pinnedProjects,
  unpinnedProjects,
  isInitialLoad,
  newWorkspaceKeys,
  commandCenterKeys,
  handleNewWorkspaceNavigate,
  handleOpenCommandCenter,
  handleOpenProject,
  handleSettings,
  labels,
  insetsTop,
  isOpen,
}: DesktopSidebarProps) {
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const { width: viewportWidth } = useWindowDimensions();

  const startWidthRef = useRef(sidebarWidth);
  const resizeWidth = useSharedValue(sidebarWidth);

  useEffect(() => {
    resizeWidth.value = sidebarWidth;
  }, [sidebarWidth, resizeWidth]);

  // Open/close progress: 0 = collapsed, 1 = expanded. The outer panel width animates to
  // resizeWidth * openProgress so the sidebar slides in/out instead of snapping (反馈: 展开收起要丝滑,
  // 现在很卡). The inner wrapper keeps the full resizeWidth, so during the slide the content is clipped at
  // the edge rather than reflowing/squishing. Initialised to the current state so the first frame matches
  // (no open-on-mount flash).
  const openProgress = useSharedValue(isOpen ? 1 : 0);
  useEffect(() => {
    openProgress.value = withTiming(isOpen ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [isOpen, openProgress]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onStart(() => {
          startWidthRef.current = sidebarWidth;
          resizeWidth.value = sidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidthRef.current + event.translationX;
          const maxWidth = Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_CHAT_WIDTH),
          );
          const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, newWidth));
          resizeWidth.value = clampedWidth;
        })
        .onEnd(() => {
          runOnJS(setSidebarWidth)(resizeWidth.value);
        }),
    [sidebarWidth, resizeWidth, setSidebarWidth, viewportWidth],
  );

  // Outer width collapses to 0 as openProgress → 0 (overflow: hidden clips the inner content as it slides
  // out). Inner width stays at the full resizeWidth so content holds its layout and clips at the edge.
  const outerWidthStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value * openProgress.value,
  }));
  const innerWidthStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
  }));

  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, outerWidthStyle],
    [outerWidthStyle],
  );
  const innerSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebarInner, innerWidthStyle],
    [innerWidthStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [styles.desktopSidebarBorder, { flex: 1, paddingTop: insetsTop }],
    [insetsTop],
  );
  const resizeHandleStyle = useMemo(
    () => [styles.resizeHandle, isWeb && ({ cursor: "col-resize" } as object)],
    [],
  );

  // 置顶项目在前 + 其余,喂给对话树(项目分组复用 use-sidebar-workspaces-list)。
  const treeProjects = useMemo(
    () => [...pinnedProjects, ...unpinnedProjects],
    [pinnedProjects, unpinnedProjects],
  );
  // Project-row "new conversation" hover action: open New Workspace scoped to that project's dir.
  const handleNewConversationInProject = useCallback(
    (project: SidebarProjectEntry) => {
      if (!activeServerId) return;
      router.navigate(
        buildHostNewWorkspaceRoute(activeServerId, project.iconWorkingDir, {
          projectId: project.projectKey,
          displayName: project.projectName,
        }),
      );
    },
    [activeServerId],
  );

  // No early `return null` when collapsed — the panel stays mounted and animates its width to 0 so the
  // expand/collapse is a smooth slide. pointerEvents drops to "none" while collapsed so the zero-width
  // (clipped) content can't capture clicks.
  return (
    <Animated.View style={desktopSidebarStyle} pointerEvents={isOpen ? "auto" : "none"}>
      <Animated.View style={innerSidebarStyle}>
        <View style={desktopSidebarBorderStyle}>
          <View style={styles.sidebarDragArea}>
            <SidebarWindowChrome collapsed={false} onNewConversation={handleNewWorkspaceNavigate} />
          </View>
          <View style={styles.hostSwitcherSlot}>
            <HostSwitcherPill activeServerId={activeServerId} />
          </View>
          <View style={styles.sidebarHeaderGroup}>
            <SidebarHeaderRow
              icon={SquarePen}
              label={labels.newConversation}
              onPress={handleNewWorkspaceNavigate}
              testID="sidebar-global-new-workspace"
              variant="compact"
              shortcutKeys={newWorkspaceKeys}
            />
            <SidebarHeaderRow
              icon={Search}
              label={labels.search}
              onPress={handleOpenCommandCenter}
              testID="sidebar-search"
              variant="compact"
              shortcutKeys={commandCenterKeys}
            />
          </View>

          {isInitialLoad ? (
            <SidebarAgentListSkeleton />
          ) : (
            <ConversationTree
              serverId={activeServerId}
              projects={treeProjects}
              onAddProject={handleOpenProject}
              onNewConversation={handleNewConversationInProject}
            />
          )}

          <SidebarCalloutSlot />

          <SidebarFooter settingsLabel={labels.settings} onSettings={handleSettings} />

          {/* Resize handle - absolutely positioned over right border */}
          <GestureDetector gesture={resizeGesture}>
            <View style={resizeHandleStyle} />
          </GestureDetector>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  backdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  mobileSidebar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden" as const,
  },
  desktopSidebar: {
    position: "relative" as const,
    // Clips the fixed-width inner wrapper as the outer width animates to 0 (the slide-out collapse).
    overflow: "hidden" as const,
  },
  // Holds the full sidebar width while the outer collapses, so content slides/clips instead of squishing.
  desktopSidebarInner: {
    flex: 1,
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarHeaderGroup: {
    paddingTop: theme.spacing[2],
    gap: 2,
    paddingBottom: theme.spacing[1.5],
  },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileCloseButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[4],
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  desktopSidebarBorder: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  resizeHandle: {
    position: "absolute",
    // Sits fully inside the sidebar's right edge so overflow: hidden (slide-collapse) doesn't clip the
    // col-resize cursor zone. The pan gesture's ±8 hitSlop keeps the grab target generous.
    right: 0,
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 10,
  },
  sidebarDragArea: {
    position: "relative",
  },
  hostSwitcherSlot: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    // Keep the pill + its anchored dropdown stacked above the list rows below it.
    zIndex: 20,
  },
  sidebarFooter: {
    paddingVertical: theme.spacing[1.5],
  },
}));
