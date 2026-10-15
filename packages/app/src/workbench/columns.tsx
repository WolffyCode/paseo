import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet as NativeStyles,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { RetainedPanel } from "@/components/retained-panel";
import type { SplitPane, WorkspaceLayout } from "@/stores/workspace-layout-actions";
import { workbenchPanes, workbenchPaneHost } from "./layout";
import { workbenchModel } from "./runtime";
import { WorkbenchResizeHandle } from "./resize-handle";
import { useStableEvent } from "@/hooks/use-stable-event";
import { WorkbenchRegionContent, WorkbenchRegionHost, WorkbenchRegionProvider } from "./regions";
import { FileText, FolderTree } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";

const EmptyContentIcon = withUnistyles(FileText, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const EmptyFilesIcon = withUnistyles(FolderTree, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface WorkbenchWorkspaceContentProps {
  active: boolean;
  layout: WorkspaceLayout;
  header?: ReactNode;
  conversations?: ReactNode;
  renderPane: (pane: SplitPane, active: boolean) => ReactNode;
}

function AnimatedColumn({
  width,
  resizing,
  children,
  label,
  surface = true,
}: {
  width: number;
  resizing: boolean;
  children: ReactNode;
  label: string;
  surface?: boolean;
}) {
  const reducedTransparency = useSyncExternalStore(
    workbenchModel.subscribe,
    () => workbenchModel.getSnapshot().reducedTransparency,
  );
  const size = useSharedValue(width);
  useEffect(() => {
    size.value = withTiming(width, {
      duration: resizing ? 0 : 240,
      reduceMotion: ReduceMotion.System,
    });
  }, [size, width, resizing]);
  const animatedStyle = useAnimatedStyle(() => ({
    width: size.value,
    opacity: Math.min(1, size.value / 40),
  }));
  return (
    <Animated.View
      style={[staticStyles.column, animatedStyle]}
      pointerEvents={width > 0 ? "auto" : "none"}
      accessibilityElementsHidden={width === 0}
      aria-hidden={width === 0}
      importantForAccessibility={width === 0 ? "no-hide-descendants" : "auto"}
    >
      <View
        style={surface ? [styles.surface, reducedTransparency && styles.opaque] : styles.track}
        testID={label}
      >
        {children}
      </View>
    </Animated.View>
  );
}

export function WorkbenchWorkspaceContent({
  layout,
  header,
  renderPane,
  active,
  conversations,
}: WorkbenchWorkspaceContentProps) {
  const panes = workbenchPanes(layout);
  function renderRegion(host: "conversations" | "content" | "files") {
    return panes
      .filter((pane) => workbenchPaneHost(pane.id) === host)
      .map((pane) => (
        <RetainedPanel key={pane.id} active={!pane.hidden} animated>
          {renderPane(pane, !pane.hidden)}
        </RetainedPanel>
      ));
  }
  return (
    <>
      <WorkbenchRegionContent region="toolbar" active={active}>
        {header}
      </WorkbenchRegionContent>
      <WorkbenchRegionContent region="content" active={active}>
        {renderRegion("content")}
      </WorkbenchRegionContent>
      <WorkbenchRegionContent region="files" active={active}>
        {renderRegion("files")}
      </WorkbenchRegionContent>
      {conversations ?? renderRegion("conversations")}
    </>
  );
}

export function WorkbenchFrame({
  navigation,
  navigationVisible,
  homeNavigation,
  workspace,
  children,
}: {
  navigation: ReactNode;
  navigationVisible: boolean;
  homeNavigation: boolean;
  workspace: boolean;
  children: ReactNode;
}) {
  const geometry = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  const measure = useStableEvent((event: LayoutChangeEvent) => {
    workbenchModel.setViewport(event.nativeEvent.layout.width);
  });
  return (
    <WorkbenchRegionProvider>
      <View style={styles.frame} testID="workbench-shell">
        <WorkbenchNavigationFrame active={navigationVisible}>
          <WorkbenchRegionHost region="navigation">
            <RetainedPanel
              active={homeNavigation}
              animated
              testID="workbench-home-navigation-content"
            >
              {navigation}
            </RetainedPanel>
          </WorkbenchRegionHost>
        </WorkbenchNavigationFrame>
        <View style={styles.root} testID="workbench-columns">
          <WorkbenchToolbar visible={workspace && geometry.workspaceActionsVisible}>
            <WorkbenchRegionHost region="toolbar" />
          </WorkbenchToolbar>
          <View style={styles.row} onLayout={measure}>
            <AnimatedColumn
              width={geometry.mainWidth}
              resizing={geometry.resizing}
              label="workbench-conversations"
              surface={!workspace}
            >
              {children}
            </AnimatedColumn>
            <AnimatedColumn
              width={geometry.contentWidth > 0 && geometry.mainWidth > 0 ? 8 : 0}
              resizing={geometry.resizing}
              label="workbench-content-boundary"
              surface={false}
            >
              <WorkbenchResizeHandle model={workbenchModel} boundary="content" />
            </AnimatedColumn>
            <AnimatedColumn
              width={geometry.contentWidth}
              resizing={geometry.resizing}
              label="workbench-content"
            >
              <WorkbenchResourceSlot region="content" workspace={workspace} />
            </AnimatedColumn>
            <AnimatedColumn
              width={geometry.filesWidth > 0 ? 8 : 0}
              resizing={geometry.resizing}
              label="workbench-files-boundary"
              surface={false}
            >
              <WorkbenchResizeHandle model={workbenchModel} boundary="files" />
            </AnimatedColumn>
            <AnimatedColumn
              width={geometry.filesWidth}
              resizing={geometry.resizing}
              label="workbench-files"
            >
              <WorkbenchResourceSlot region="files" workspace={workspace} />
            </AnimatedColumn>
          </View>
        </View>
      </View>
    </WorkbenchRegionProvider>
  );
}

function WorkbenchResourceSlot({
  region,
  workspace,
}: {
  region: "content" | "files";
  workspace: boolean;
}) {
  const Icon = region === "content" ? EmptyContentIcon : EmptyFilesIcon;
  const label = region === "content" ? "尚未打开内容" : "尚未关联工作区";
  return (
    <WorkbenchRegionHost region={region}>
      <RetainedPanel active={!workspace} animated>
        <View style={styles.empty}>
          <Icon size={24} />
          <Text style={styles.emptyLabel}>{label}</Text>
        </View>
      </RetainedPanel>
    </WorkbenchRegionHost>
  );
}

function WorkbenchToolbar({ visible, children }: { visible: boolean; children: ReactNode }) {
  const height = useSharedValue(visible ? 44 : 0);
  useEffect(() => {
    height.value = withTiming(visible ? 44 : 0, {
      duration: 240,
      reduceMotion: ReduceMotion.System,
    });
  }, [height, visible]);
  const style = useAnimatedStyle(() => ({
    height: height.value,
    opacity: Math.min(1, height.value / 24),
    overflow: "hidden" as const,
  }));
  return (
    <Animated.View style={style} pointerEvents={visible ? "auto" : "none"} aria-hidden={!visible}>
      {children}
    </Animated.View>
  );
}

function WorkbenchNavigationFrame({ active, children }: { active: boolean; children: ReactNode }) {
  const geometry = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  const { width } = useWindowDimensions();
  useEffect(() => workbenchModel.setWindowWidth(width), [width]);
  return (
    <View style={styles.navigation}>
      <AnimatedColumn
        width={active ? geometry.navigationWidth : 0}
        resizing={geometry.resizing}
        label="workbench-navigation"
      >
        {children}
      </AnimatedColumn>
      <AnimatedColumn
        width={active ? 8 : 0}
        resizing={geometry.resizing}
        label="workbench-navigation-boundary"
        surface={false}
      >
        <WorkbenchResizeHandle model={workbenchModel} boundary="navigation" />
      </AnimatedColumn>
    </View>
  );
}

const staticStyles = NativeStyles.create({
  column: { overflow: "hidden", minWidth: 0, height: "100%" },
});
const styles = StyleSheet.create((theme) => ({
  frame: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: "row" },
  root: { flex: 1, minWidth: 0, minHeight: 0 },
  navigation: { flexDirection: "row", minHeight: 0 },
  track: { flex: 1, minWidth: 0 },
  row: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: "row",
  },
  surface: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.workbenchEdge,
    overflow: "hidden",
    backgroundColor: theme.colors.workbenchSurface,
  },
  opaque: { backgroundColor: theme.colors.surface0 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 16 },
  emptyLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
