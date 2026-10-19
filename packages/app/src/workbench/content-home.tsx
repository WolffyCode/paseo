import {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
  type TargetedEvent,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, MessageSquare, Puzzle } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { isWeb } from "@/constants/platform";
import { BrowserPageIcon } from "@/desktop/browser/page-presentation";
import { useBrowserStore } from "@/desktop/browser/store";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { useKeyboardActionDispatcher } from "@/keyboard/keyboard-action-dispatcher-context";
import {
  LAUNCHER_ICON_SIZE,
  LAUNCHER_ROW_DATA_SET,
  LauncherShortcut,
  ThemedLauncherIcon,
} from "@/panels/launcher-rows";
import { usePaneContext } from "@/panels/pane-context";
import { getPanelRegistration, type PanelIconProps } from "@/panels/panel-registry";
import { ensurePanelsRegistered } from "@/panels/register-panels";
import {
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import { findPaneById, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { STATUS_INDICATOR_FILLED_DOT_SIZE } from "@/utils/status-indicator-geometry";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  type ContentRecent,
  contentRecentIdentity,
  findOpenTabForRecent,
  type OpenRecentTab,
  useContentRecents,
} from "@/workbench/content-recents";
import { workbenchPaneOwner } from "@/workbench/layout";
import {
  useWorkspaceTabLauncher,
  type WorkspaceTabLaunchGroup,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTab } from "@/workspace-tabs/model";

const ThemedBrowserPageIcon = withUnistyles(BrowserPageIcon);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const HOME_MAX_WIDTH = 520;
const HOME_ROW_HEIGHT = 40;
const RECENT_ROW_LIMIT = 5;
/** 打开 splits into two columns only when each column keeps this much room. */
const OPEN_COLUMN_MIN_WIDTH = 220;
const TWO_COLUMN_MIN_WIDTH = OPEN_COLUMN_MIN_WIDTH * 2 + SPACING[3];
const NO_TABS: readonly WorkspaceTab[] = [];

interface HomeAction {
  id: string;
  label: string;
  Icon?: ComponentType<PanelIconProps>;
  shortcutActionId?: string;
  disabled: boolean;
  run: () => void;
}

interface RecentEntry {
  recent: ContentRecent;
  openTab: OpenRecentTab | null;
}

function homeRowStyle(
  { pressed, hovered = false }: PressableStateCallbackType,
  isKeyboardFocused: boolean,
) {
  return [
    styles.row,
    (hovered || pressed || isKeyboardFocused) && styles.rowHovered,
    isKeyboardFocused && styles.rowFocused,
  ];
}

function HomeRow({
  accessibilityLabel,
  disabled = false,
  onPress,
  testID,
  children,
}: {
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
  testID: string;
  children: ReactNode;
}) {
  // A click focuses the row too, and rows such as 文件 keep the home open. Only keyboard focus
  // keeps a row highlighted once the pointer has left. Read it when focus arrives: by blur the
  // row no longer matches :focus-visible.
  const [isKeyboardFocused, setIsKeyboardFocused] = useState(false);
  const handleFocus = useCallback((event: NativeSyntheticEvent<TargetedEvent>) => {
    if (!isWeb) return;
    const row: unknown = event.currentTarget;
    setIsKeyboardFocused(row instanceof HTMLElement && row.matches(":focus-visible"));
  }, []);
  const handleBlur = useCallback(() => setIsKeyboardFocused(false), []);
  const rowStyle = useCallback(
    (state: PressableStateCallbackType) => homeRowStyle(state, isKeyboardFocused),
    [isKeyboardFocused],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      dataSet={LAUNCHER_ROW_DATA_SET}
      disabled={disabled}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={rowStyle}
      tabIndex={-1}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

function HomeSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ActionRow({ action }: { action: HomeAction }) {
  return (
    <HomeRow
      accessibilityLabel={action.label}
      disabled={action.disabled}
      onPress={action.run}
      testID={`workbench-home-${action.id}`}
    >
      {action.Icon ? <ThemedLauncherIcon Icon={action.Icon} uniProps={mutedColorMapping} /> : null}
      <Text numberOfLines={1} style={styles.rowLabel}>
        {action.label}
      </Text>
      {action.shortcutActionId ? <LauncherShortcut actionId={action.shortcutActionId} /> : null}
    </HomeRow>
  );
}

function ActionGrid({ actions, columnCount }: { actions: HomeAction[]; columnCount: number }) {
  const gridRows: HomeAction[][] = [];
  for (let index = 0; index < actions.length; index += columnCount) {
    gridRows.push(actions.slice(index, index + columnCount));
  }
  return (
    <View style={styles.rows}>
      {gridRows.map((rowActions) => (
        <View key={rowActions[0]?.id} style={styles.gridRow}>
          {rowActions.map((action) => (
            <View key={action.id} style={styles.gridCell}>
              <ActionRow action={action} />
            </View>
          ))}
          {rowActions.length < columnCount ? <View style={styles.gridCell} /> : null}
        </View>
      ))}
    </View>
  );
}

function RecentTime({ at }: { at: number }) {
  const label = useCompactTimeAgo(new Date(at));
  return <Text style={styles.recentMeta}>{label}</Text>;
}

function RunningLabel() {
  const { t } = useTranslation();
  return (
    <View style={styles.running}>
      <View style={styles.runningDot} />
      <Text style={styles.recentMeta}>{t("workspace.home.running")}</Text>
    </View>
  );
}

function RecentRow({
  entry,
  label,
  detail,
  isRunning,
  showsDetail,
  onOpen,
  children,
}: {
  entry: RecentEntry;
  label: string;
  detail: string;
  isRunning: boolean;
  showsDetail: boolean;
  onOpen: (entry: RecentEntry) => void;
  /** The row's leading icon. */
  children: ReactNode;
}) {
  const handlePress = useCallback(() => onOpen(entry), [entry, onOpen]);
  return (
    <HomeRow
      accessibilityLabel={label}
      onPress={handlePress}
      testID={`workbench-home-recent-${contentRecentIdentity(entry.recent)}`}
    >
      {children}
      <Text numberOfLines={1} style={showsDetail ? styles.recentTitle : styles.rowLabel}>
        {label}
      </Text>
      {showsDetail ? (
        <Text numberOfLines={1} style={styles.recentDetail}>
          {detail}
        </Text>
      ) : null}
      {isRunning ? <RunningLabel /> : <RecentTime at={entry.recent.at} />}
    </HomeRow>
  );
}

/** A page row shows what was recorded, since its browser tab may be long gone. */
function PageRecentRow({
  entry,
  recent,
  showsDetail,
  onOpen,
}: {
  entry: RecentEntry;
  recent: Extract<ContentRecent, { kind: "page" }>;
  showsDetail: boolean;
  onOpen: (entry: RecentEntry) => void;
}) {
  return (
    <RecentRow
      entry={entry}
      label={recent.title}
      detail={recent.url.replace(/^https?:\/\//, "")}
      isRunning={false}
      showsDetail={showsDetail}
      onOpen={onOpen}
    >
      <ThemedBrowserPageIcon
        faviconUrl={recent.faviconUrl}
        size={LAUNCHER_ICON_SIZE}
        uniProps={mutedColorMapping}
      />
    </RecentRow>
  );
}

/** File and terminal rows present like the tab they open, through that panel's descriptor. */
function PanelRecentRow({
  entry,
  recent,
  serverId,
  workspaceId,
  paneId,
  showsDetail,
  onOpen,
}: {
  entry: RecentEntry;
  recent: Extract<ContentRecent, { kind: "file" | "terminal" }>;
  serverId: string;
  workspaceId: string;
  paneId: string | null;
  showsDetail: boolean;
  onOpen: (entry: RecentEntry) => void;
}) {
  const tab = useMemo(() => {
    const identity = contentRecentIdentity(recent);
    const target: WorkspaceTab["target"] =
      recent.kind === "file"
        ? { kind: "file", path: recent.path }
        : { kind: "terminal", terminalId: recent.terminalId };
    // A closed file has no tab; its presentation only needs a stable key.
    return { key: identity, tabId: entry.openTab?.tabId ?? identity, kind: target.kind, target };
  }, [entry.openTab, recent]);
  const renderRow = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <RecentRow
        entry={entry}
        label={presentation.label}
        detail={presentation.subtitle}
        isRunning={presentation.statusBucket === "running"}
        showsDetail={showsDetail}
        onOpen={onOpen}
      >
        <ThemedLauncherIcon Icon={presentation.icon} uniProps={mutedColorMapping} />
      </RecentRow>
    ),
    [entry, onOpen, showsDetail],
  );
  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={serverId}
      workspaceId={workspaceId}
      paneId={paneId}
    >
      {renderRow}
    </WorkspaceTabPresentationResolver>
  );
}

function RecentList({
  entries,
  serverId,
  workspaceId,
  paneId,
  showsDetail,
  onOpen,
}: {
  entries: RecentEntry[];
  serverId: string;
  workspaceId: string;
  paneId: string | null;
  showsDetail: boolean;
  onOpen: (entry: RecentEntry) => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <Text style={styles.emptyLine}>{t("workspace.home.noRecent")}</Text>;
  }
  return (
    <View style={styles.rows}>
      {entries.map((entry) => {
        const { recent } = entry;
        const key = contentRecentIdentity(recent);
        if (recent.kind === "page") {
          return (
            <PageRecentRow
              key={key}
              entry={entry}
              recent={recent}
              showsDetail={showsDetail}
              onOpen={onOpen}
            />
          );
        }
        return (
          <PanelRecentRow
            key={key}
            entry={entry}
            recent={recent}
            serverId={serverId}
            workspaceId={workspaceId}
            paneId={paneId}
            showsDetail={showsDetail}
            onOpen={onOpen}
          />
        );
      })}
    </View>
  );
}

function launchItemInPlace(item: WorkspaceTabLaunchItem, tabId: string): HomeAction {
  return {
    id: item.id,
    label: item.label,
    Icon: item.Icon,
    shortcutActionId: item.shortcutActionId,
    disabled: item.disabled,
    run: () => item.launch({ kind: "replace", tabId }),
  };
}

/** Column 3's home page: open a view, a plugin panel, or something this conversation opened before. */
export function ContentHome({
  catalog,
}: {
  catalog: readonly WorkspaceTabLaunchGroup[];
}): ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { serverId, workspaceId, paneId, tabId } = usePaneContext();
  const launcher = useWorkspaceTabLauncher();
  const keyboardActionDispatcher = useKeyboardActionDispatcher();
  const [isNarrow, setIsNarrow] = useState(false);

  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const owner = paneId ? workbenchPaneOwner(paneId) : null;
  const recents = useContentRecents(workspaceKey && owner ? { workspaceKey, owner } : null);
  const paneTabs = useWorkspaceLayoutStore((state) => {
    const layout = workspaceKey ? state.layoutByWorkspace[workspaceKey] : undefined;
    if (!layout) return NO_TABS;
    return findPaneById(layout.root, paneId)?.tabs ?? NO_TABS;
  });
  const browsersById = useBrowserStore((state) => state.browsersById);

  ensurePanelsRegistered();
  const filesPresentation = getPanelRegistration("files")?.presentation;
  invariant(filesPresentation, "The files panel has no launch presentation");

  const tabItems = catalog.find((group) => group.id === "tabs")?.items ?? [];
  const pluginItems = catalog.find((group) => group.id === "plugin-panels")?.items ?? [];
  const browserItem = tabItems.find((item) => item.id === "browser");
  const terminalItem = tabItems.find((item) => item.id === "terminal");
  const otherItems = tabItems.filter((item) => item !== browserItem && item !== terminalItem);
  // Side chat and files open outside column 3, so the home tab stays where it is.
  const sideChatAction: HomeAction = {
    id: "side-chat",
    label: t("workspace.home.sideChat"),
    Icon: MessageSquare,
    shortcutActionId: "focus-message-input",
    disabled: false,
    run: () =>
      keyboardActionDispatcher.dispatch({ id: "message-input.focus", scope: "message-input" }),
  };
  const filesAction: HomeAction = {
    id: "files",
    label: filesPresentation.label(t),
    Icon: filesPresentation.icon,
    shortcutActionId: "workspace-tab-target-files",
    disabled: false,
    run: () =>
      keyboardActionDispatcher.dispatch({ id: "workspace.tab.target.files", scope: "workspace" }),
  };
  const openActions: HomeAction[] = [];
  if (browserItem) openActions.push(launchItemInPlace(browserItem, tabId));
  if (terminalItem) openActions.push(launchItemInPlace(terminalItem, tabId));
  openActions.push(sideChatAction, filesAction);
  for (const item of otherItems) openActions.push(launchItemInPlace(item, tabId));
  const pluginActions = pluginItems.map((item) => launchItemInPlace(item, tabId));

  const urlOfBrowser = (browserId: string) => browsersById[browserId]?.url ?? null;
  const recentEntries: RecentEntry[] = recents.map((recent) => ({
    recent,
    openTab: findOpenTabForRecent({ tabs: paneTabs, recent, urlOfBrowser }),
  }));
  // A closed terminal's session is gone, so it cannot be reopened from here.
  const listedEntries = recentEntries
    .filter((entry) => entry.recent.kind !== "terminal" || entry.openTab !== null)
    .slice(0, RECENT_ROW_LIMIT);

  const openRecent = useCallback(
    (entry: RecentEntry) => {
      if (entry.openTab && workspaceKey) {
        useWorkspaceLayoutStore.getState().focusTab(workspaceKey, entry.openTab.tabId);
        return;
      }
      const replaceHome = { kind: "replace", tabId } as const;
      if (entry.recent.kind === "page") {
        launcher.launch({ kind: "browser", url: entry.recent.url }, replaceHome);
        return;
      }
      if (entry.recent.kind === "file") {
        const fileTarget = { kind: "file", path: entry.recent.path } as const;
        launcher.launch({ kind: "target", target: fileTarget }, replaceHome);
      }
    },
    [launcher, tabId, workspaceKey],
  );
  const browsePlugins = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(serverId, "plugins") as Href);
  }, [router, serverId]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setIsNarrow(event.nativeEvent.layout.width < TWO_COLUMN_MIN_WIDTH);
  }, []);
  const columnCount = isNarrow ? 1 : 2;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.home} onLayout={handleLayout}>
        <HomeSection label={t("workspace.home.open")}>
          <ActionGrid actions={openActions} columnCount={columnCount} />
        </HomeSection>
        <HomeSection label={t("workspace.home.plugins")}>
          {pluginActions.length > 0 ? (
            <ActionGrid actions={pluginActions} columnCount={columnCount} />
          ) : null}
          <HomeRow
            accessibilityLabel={t("workspace.home.browsePlugins")}
            onPress={browsePlugins}
            testID="workbench-home-browse-plugins"
          >
            <ThemedLauncherIcon Icon={Puzzle} uniProps={mutedColorMapping} />
            <Text numberOfLines={1} style={styles.rowLabel}>
              {t("workspace.home.browsePlugins")}
            </Text>
            <ThemedChevronRight size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
          </HomeRow>
        </HomeSection>
        <HomeSection label={t("workspace.home.recent")}>
          <RecentList
            entries={listedEntries}
            serverId={serverId}
            workspaceId={workspaceId}
            paneId={paneId}
            showsDetail={!isNarrow}
            onOpen={openRecent}
          />
        </HomeSection>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[8],
  },
  home: {
    width: "100%",
    maxWidth: HOME_MAX_WIDTH,
    gap: theme.spacing[8],
  },
  section: {
    gap: theme.spacing[1.5],
  },
  // Label and row content share one rail: the row's horizontal padding.
  sectionLabel: {
    paddingHorizontal: theme.spacing[3],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  rows: {
    gap: theme.spacing[0.5],
  },
  gridRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: HOME_ROW_HEIGHT,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowFocused: {
    borderColor: theme.colors.borderAccent,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  recentTitle: {
    flexShrink: 1,
    maxWidth: "45%",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  recentDetail: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  recentMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  running: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  runningDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor:
      getStatusDotColor({ theme, bucket: "running" }) ?? theme.colors.foregroundMuted,
  },
  emptyLine: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
