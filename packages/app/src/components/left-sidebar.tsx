import { router, usePathname } from "expo-router";
import {
  FolderPlus,
  Maximize2,
  Minimize2,
  Search,
  Settings,
  SquarePen,
  X,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { useSidebarAnimation } from "@/contexts/sidebar-animation-context";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useSidebarShortcutModel } from "@/hooks/use-sidebar-shortcut-model";
import {
  type SidebarProjectEntry,
  useSidebarWorkspacesList,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useHosts } from "@/runtime/host-runtime";
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  usePanelStore,
} from "@/stores/panel-store";
import { resolveActiveHost } from "@/utils/active-host";
import { useWindowControlsPadding } from "@/utils/desktop-window";
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

interface SidebarSharedProps {
  theme: SidebarTheme;
  activeServerId: string | null;
  projects: SidebarProjectEntry[];
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
    projects,
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

function HeaderIconTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

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
  projects,
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
            <WorkspacesSectionHeader
              allCollapsed={allProjectsCollapsed}
              onToggleCollapseAll={handleToggleCollapseAll}
              onSelectFolder={handleOpenProject}
            />
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
                projects={projects}
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
  projects,
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
  isOpen,
}: DesktopSidebarProps) {
  const padding = useWindowControlsPadding("sidebar");
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const { width: viewportWidth } = useWindowDimensions();

  const startWidthRef = useRef(sidebarWidth);
  const resizeWidth = useSharedValue(sidebarWidth);

  useEffect(() => {
    resizeWidth.value = sidebarWidth;
  }, [sidebarWidth, resizeWidth]);

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

  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
  }));

  const paddingTopSpacerStyle = useMemo(() => ({ height: padding.top }), [padding.top]);
  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, resizeAnimatedStyle],
    [resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [styles.desktopSidebarBorder, { flex: 1, paddingTop: insetsTop }],
    [insetsTop],
  );
  const resizeHandleStyle = useMemo(
    () => [styles.resizeHandle, isWeb && ({ cursor: "col-resize" } as object)],
    [],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Animated.View style={desktopSidebarStyle}>
      <View style={desktopSidebarBorderStyle}>
        <View style={styles.sidebarDragArea}>
          <TitlebarDragRegion />
          {padding.top > 0 ? <View style={paddingTopSpacerStyle} /> : null}
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
        </View>
        <WorkspacesSectionHeader
          allCollapsed={allProjectsCollapsed}
          onToggleCollapseAll={handleToggleCollapseAll}
          onSelectFolder={handleOpenProject}
        />

        {isInitialLoad ? (
          <SidebarAgentListSkeleton />
        ) : (
          <SidebarWorkspaceList
            serverId={activeServerId}
            collapsedProjectKeys={collapsedProjectKeys}
            onToggleProjectCollapsed={toggleProjectCollapsed}
            shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
            groupMode={groupMode}
            projects={projects}
            isRefreshing={isManualRefresh && isRevalidating}
            onRefresh={handleRefresh}
            onAddProject={handleOpenProject}
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
  );
}

function WorkspacesSectionHeader({
  allCollapsed,
  onToggleCollapseAll,
  onSelectFolder,
}: {
  allCollapsed: boolean;
  onToggleCollapseAll: () => void;
  onSelectFolder: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const isCompact = useIsCompactFormFactor();
  // Codex behavior: the project actions are revealed on hover (web) and always shown on
  // touch/compact where hover is unreachable. Plain-View pointer tracking per docs/hover.md.
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const showActions = isHovered || isNative || isCompact;
  const actionsStyle = useMemo(
    () => [styles.workspacesSectionActions, { opacity: showActions ? 1 : 0 }],
    [showActions],
  );
  const iconButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.workspacesHeaderIconButton,
      (hovered || pressed) && styles.workspacesHeaderIconButtonHovered,
    ],
    [],
  );
  const collapseAllLabel = allCollapsed ? "Expand all" : "Collapse all";
  const CollapseAllIcon = allCollapsed ? Maximize2 : Minimize2;

  return (
    <View
      style={styles.workspacesSectionHeader}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Text style={styles.workspacesSectionTitle}>{t("sidebar.sections.projects")}</Text>
      <View style={actionsStyle} pointerEvents={showActions ? "auto" : "none"}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={collapseAllLabel}
              testID="sidebar-projects-collapse-all"
              style={iconButtonStyle}
              onPress={onToggleCollapseAll}
            >
              {({ hovered, pressed }) => (
                <CollapseAllIcon
                  size={14}
                  color={
                    hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                  }
                />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <HeaderIconTooltipContent label={collapseAllLabel} />
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select folder"
              testID="sidebar-projects-select-folder"
              style={iconButtonStyle}
              onPress={onSelectFolder}
            >
              {({ hovered, pressed }) => (
                <FolderPlus
                  size={14}
                  color={
                    hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                  }
                />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <HeaderIconTooltipContent label="Select folder" />
          </TooltipContent>
        </Tooltip>
      </View>
    </View>
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
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarHeaderGroup: {
    paddingTop: theme.spacing[2],
    gap: 2,
    paddingBottom: theme.spacing[1.5],
  },
  workspacesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    // Align the title with the compact rows' icons and the project icons below
    // (listContent + projectRow inner padding both spacing[2]).
    paddingLeft: theme.spacing[2] + theme.spacing[2],
    // Align the trailing action pill's right edge with the New workspace and
    // project row pills (both 8px from the sidebar edge).
    paddingRight: theme.spacing[2],
    // Less than sidebarHeaderGroup's paddingBottom: the 28px-tall action buttons
    // center the title and add their own offset above it, so equal padding reads
    // as a larger gap than History's. Trim paddingTop to balance it visually.
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  workspacesSectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  workspacesSectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  workspacesHeaderIconButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  workspacesHeaderIconButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
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
    right: -5,
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 10,
  },
  sidebarDragArea: {
    position: "relative",
  },
  sidebarFooter: {
    paddingVertical: theme.spacing[1.5],
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
}));
