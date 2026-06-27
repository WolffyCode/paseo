import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useIsFocused } from "@react-navigation/native";
import { ActivityIndicator, Keyboard, Pressable, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import { DiffStat } from "@/components/diff-stat";
import {
  CopyX,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  Copy,
  Ellipsis,
  EllipsisVertical,
  FileCode,
  GitCompare,
  Globe,
  Import as ImportIcon,
  MessageSquarePlus,
  Maximize2,
  Minimize2,
  PanelRight,
  Pencil,
  RotateCw,
  Settings,
  SquarePen,
  SquareTerminal,
  X,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import invariant from "tiny-invariant";
import { SidebarMenuToggle } from "@/components/headers/menu-header";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { ScreenHeader } from "@/components/headers/screen-header";
import { ScreenTitle } from "@/components/headers/screen-title";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Shortcut } from "@/components/ui/shortcut";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FloatingPanelPortalHost,
  FloatingPanelPortalHostNameProvider,
} from "@/components/ui/floating-panel-portal";
import { MountedTabActiveContext, SplitContainer } from "@/components/split-container";
import { SourceControlPanelIcon } from "@/components/icons/source-control-panel-icon";
import { WorkspaceGitActions } from "@/git/workspace-actions";
import { WorkspaceOpenInEditorButton } from "@/screens/workspace/workspace-open-in-editor-button";
import { WorkspaceScriptsButton } from "@/screens/workspace/workspace-scripts-button";
import { ImportSessionSheet } from "@/components/import-session-sheet";
import { useToast } from "@/contexts/toast-context";
import { usePanelStore } from "@/stores/panel-store";
import {
  useSessionStore,
  useWorkspaceRestoreStatus,
  type WorkspaceDescriptor,
} from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  collectAllTabs,
  getFocusedBrowserId,
  isRightToolPanelOpen,
  type WorkspaceLayout,
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
} from "@/stores/workspace-layout-store";
import {
  removeRightToolPanelFromLayout,
  keepOnlyRightToolPanelInLayout,
} from "@/stores/workspace-layout-actions";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type {
  KeyboardActionDefinition,
  KeyboardActionId,
} from "@/keyboard/keyboard-action-dispatcher";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import {
  buildDeterministicWorkspaceTabId,
  normalizeWorkspaceTabTarget,
  workspaceTabTargetsEqual,
} from "@/workspace-tabs/identity";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
  useHostRuntimeSnapshot,
  useHosts,
} from "@/runtime/host-runtime";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { shouldShowWorkspaceSetup, useWorkspaceSetupStore } from "@/stores/workspace-setup-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useWorkspaceTerminalSessionRetention } from "@/terminal/hooks/use-workspace-terminal-session-retention";
import type { CheckoutStatusPayload } from "@/git/use-status-query";
import { checkoutStatusQueryKey } from "@/git/query-keys";
import { fetchCheckoutStatus } from "@/git/checkout-status-cache";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useStableEvent } from "@/hooks/use-stable-event";
import { createWorkspaceBrowser, useBrowserStore } from "@/stores/browser-store";
import { getDesktopHost } from "@/desktop/host";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { generateDraftId } from "@/stores/draft-keys";
import { resolveWorkspaceRouteId } from "@/utils/workspace-identity";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  WorkspaceTabOptionRow,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";
import {
  WorkspaceDesktopTabsRow,
  WorkspaceToolPicker,
  type WorkspaceDesktopTabRowItem,
  type WorkspaceToolsAddHandlers,
} from "@/screens/workspace/workspace-desktop-tabs-row";
import { MAIN_PANE_ID, RIGHT_PANEL_PANE_ID } from "@/workspace-tabs/tab-surface";
import {
  buildWorkspaceTabMenuEntries,
  type WorkspaceTabMenuEntry,
  type WorkspaceTabMenuLabels,
} from "@/screens/workspace/workspace-tab-menu";
import { useDesktopBrowserNewTabRequests } from "@/browser/new-tab-requests";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  resolveWorkspaceHeaderRenderState,
  type WorkspaceHeaderCheckoutState,
} from "@/screens/workspace/workspace-header-source";
import {
  resolveWorkspaceRouteState,
  type WorkspaceRouteState,
} from "@/screens/workspace/workspace-route-state";
import { renderWorkspaceRouteGate } from "@/screens/workspace/workspace-route-state-views";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
  workspaceAgentVisibilityEqual,
} from "@/workspace-tabs/agent-visibility";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import { ComposerDockProvider } from "@/panels/composer-dock-context";
import {
  buildWorkspacePaneContentModel,
  WorkspacePaneContent,
  type WorkspacePaneContentModel,
} from "@/screens/workspace/workspace-pane-content";
import { useMountedTabSet } from "@/screens/workspace/use-mounted-tab-set";
import { WorkspaceFocusProvider } from "@/workspace/focus";
import { shouldSeedEmptyWorkspaceDraft } from "@/screens/workspace/workspace-empty-draft-seed";
import {
  buildBulkCloseConfirmationMessage,
  type BulkCloseConfirmationLabels,
  classifyBulkClosableTabs,
  closeBulkWorkspaceTabs,
} from "@/screens/workspace/workspace-bulk-close";
import { resolveCloseAgentTabPolicy } from "@/subagents";
import { findAdjacentPane } from "@/utils/split-navigation";
import {
  useIsCompactFormFactor,
  supportsDesktopPaneSplits,
  WORKSPACE_SECONDARY_HEADER_HEIGHT,
} from "@/constants/layout";
import { getIsElectron, isNative, isWeb } from "@/constants/platform";
import { useContainerWidthBelow } from "@/hooks/use-container-width";
import {
  buildHostRootRoute,
  buildSettingsHostRoute,
  buildSettingsHostSectionRoute,
} from "@/utils/host-routes";
import { canCreateWorkspaceTerminal } from "@/screens/workspace/terminals/state";
import {
  useWorkspaceTerminals,
  type TerminalProfileInput,
} from "@/screens/workspace/terminals/use-workspace-terminals";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import {
  getTerminalProfileIcon,
  resolveTerminalProfiles,
} from "@getpaseo/protocol/terminal-profiles";
import { getProviderIcon } from "@/components/provider-icons";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type WorkspaceFileLocation,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import { RenderProfile } from "@/utils/render-profiler";

const WORKSPACE_SETUP_AUTO_OPEN_WINDOW_MS = 30_000;
const WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX = "workspace-floating-panels";
const EMPTY_UI_TABS: WorkspaceTab[] = [];
const EMPTY_WORKSPACE_SCRIPTS: WorkspaceDescriptor["scripts"] = [];
const EMPTY_PINNED_AGENT_IDS = new Set<string>();
const EMPTY_SET = new Set<string>();
// Product: the workspace scripts (paseo.json service runner) button is hidden.
// Flip to re-enable the ▷ run menu in the workspace header.
const SHOW_WORKSPACE_SCRIPTS_BUTTON = false;

function getWorkspaceScripts(
  workspaceDescriptor: WorkspaceDescriptor | null | undefined,
): WorkspaceDescriptor["scripts"] {
  return workspaceDescriptor?.scripts ?? EMPTY_WORKSPACE_SCRIPTS;
}

interface WorkspaceFileLocationFields {
  path: string | null;
  lineStart?: number;
  lineEnd?: number;
}

function getWorkspaceFileLocationFields(
  tab: WorkspaceTabDescriptor | null,
): WorkspaceFileLocationFields {
  const target = tab?.target;
  if (target?.kind !== "file") {
    return { path: null };
  }
  return { path: target.path, lineStart: target.lineStart, lineEnd: target.lineEnd };
}

function buildWorkspaceFileLocation(
  fields: WorkspaceFileLocationFields,
): WorkspaceFileLocation | null {
  if (fields.path === null) {
    return null;
  }
  return { path: fields.path, lineStart: fields.lineStart, lineEnd: fields.lineEnd };
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedEllipsisVertical = withUnistyles(EllipsisVertical);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedCopy = withUnistyles(Copy);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine);
const ThemedCopyX = withUnistyles(CopyX);
const ThemedPencil = withUnistyles(Pencil);
const ThemedX = withUnistyles(X);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedGlobe = withUnistyles(Globe);
const ThemedGitCompare = withUnistyles(GitCompare);
const ThemedFileCode = withUnistyles(FileCode);
const ThemedMessageSquarePlus = withUnistyles(MessageSquarePlus);
const ThemedImport = withUnistyles(ImportIcon);
const ThemedSettings = withUnistyles(Settings);
const ThemedPanelRight = withUnistyles(PanelRight);
const ThemedMaximize2 = withUnistyles(Maximize2);
const ThemedMinimize2 = withUnistyles(Minimize2);
const ThemedSourceControlPanelIcon = withUnistyles(SourceControlPanelIcon);

interface DynamicProviderIconProps {
  iconKey: string;
  size: number;
  color?: string;
}

function DynamicProviderIcon({ iconKey, size, color = "" }: DynamicProviderIconProps) {
  const Icon = getProviderIcon(iconKey);
  return <Icon size={size} color={color} />;
}

const ThemedDynamicProviderIcon = withUnistyles(DynamicProviderIcon);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const sourceControlPanelStrokeWidth15 = { strokeWidth: 1.5 };

const MENU_NEW_AGENT_ICON = <ThemedSquarePen size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_TERMINAL_ICON = <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_BROWSER_ICON = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;
const MENU_REVIEW_ICON = <ThemedGitCompare size={16} uniProps={mutedColorMapping} />;
const MENU_FILE_ICON = <ThemedFileCode size={16} uniProps={mutedColorMapping} />;
const MENU_SIDE_CHAT_ICON = <ThemedMessageSquarePlus size={16} uniProps={mutedColorMapping} />;
const MENU_IMPORT_ICON = <ThemedImport size={16} uniProps={mutedColorMapping} />;
const MENU_COPY_ICON = <ThemedCopy size={16} uniProps={mutedColorMapping} />;
const MENU_SETTINGS_ICON = <ThemedSettings size={16} uniProps={mutedColorMapping} />;
const GATED_WORKSPACE_HEADER_LEFT = <SidebarMenuToggle />;
const TOOL_PANEL_TOGGLE_OPEN_STATE = { expanded: true } as const;
const TOOL_PANEL_TOGGLE_CLOSED_STATE = { expanded: false } as const;

interface WorkspaceScreenProps {
  serverId: string;
  workspaceId: string;
  isRouteFocused?: boolean;
}

type WorkspaceScreenContentProps = WorkspaceScreenProps & {
  isRouteFocused: boolean;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function useSyncWorkspaceActiveBrowser(input: {
  workspaceLayout: WorkspaceLayout | null;
  isRouteFocused: boolean;
}) {
  const focusedBrowserId = useMemo(
    () => getFocusedBrowserId(input.workspaceLayout),
    [input.workspaceLayout],
  );
  const desktopActiveBrowserId = input.isRouteFocused ? focusedBrowserId : null;

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }
    void getDesktopHost()?.browser?.setWorkspaceActiveBrowser?.(desktopActiveBrowserId);
  }, [desktopActiveBrowserId]);
}

function getFallbackTabOptionLabel(
  tab: WorkspaceTabDescriptor,
  labels: {
    newAgent: string;
    setup: string;
    terminal: string;
    browser: string;
    agent: string;
    review: string;
    files: string;
  },
): string {
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.setup;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "browser") {
    return labels.browser;
  }
  if (tab.target.kind === "review") {
    return labels.review;
  }
  if (tab.target.kind === "files") {
    return labels.files;
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").findLast(Boolean) ?? tab.target.path;
  }
  return labels.agent;
}

function getFallbackTabOptionDescription(
  tab: WorkspaceTabDescriptor,
  labels: {
    newAgent: string;
    workspaceSetup: string;
    agent: string;
    terminal: string;
    browser: string;
    review: string;
    files: string;
  },
): string {
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.workspaceSetup;
  }
  if (tab.target.kind === "agent") {
    return labels.agent;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "browser") {
    return labels.browser;
  }
  if (tab.target.kind === "review") {
    return labels.review;
  }
  if (tab.target.kind === "files") {
    return labels.files;
  }
  if (tab.target.kind === "file") {
    return tab.target.path;
  }
  return labels.agent;
}

interface MobileWorkspaceTabSwitcherProps {
  tabs: WorkspaceTabDescriptor[];
  activeTabKey: string;
  activeTab: WorkspaceTabDescriptor | null;
  tabSwitcherOptions: ComboboxOption[];
  tabByKey: Map<string, WorkspaceTabDescriptor>;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onSelectSwitcherTab: (key: string) => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsAbove: (tabId: string) => Promise<void> | void;
  onCloseTabsBelow: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
}

function MobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
}: {
  activeTab: WorkspaceTabDescriptor | null;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
}) {
  if (!activeTab) {
    return null;
  }

  return (
    <ResolvedMobileActiveTabTrigger
      activeTab={activeTab}
      normalizedServerId={normalizedServerId}
      normalizedWorkspaceId={normalizedWorkspaceId}
    />
  );
}

function ResolvedMobileActiveTabTrigger({
  activeTab,
  normalizedServerId,
  normalizedWorkspaceId,
}: {
  activeTab: WorkspaceTabDescriptor;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceTabPresentationResolver
      tab={activeTab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => (
        <>
          <View style={styles.switcherTriggerIcon} testID="workspace-active-tab-icon">
            <WorkspaceTabIcon presentation={presentation} active />
          </View>

          <Text style={styles.switcherTriggerText} numberOfLines={1}>
            {presentation.titleState === "loading"
              ? t("workspace.tabs.loading")
              : presentation.label}
          </Text>
        </>
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function WorkspaceDocumentTitleEffect({
  label,
  titleState,
}: {
  label: string;
  titleState: "ready" | "loading";
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (isNative || typeof document === "undefined") {
      return;
    }
    const resolvedLabel = label.trim();
    document.title =
      titleState === "loading"
        ? t("workspace.tabs.loading")
        : resolvedLabel || t("workspace.tabs.fallback.workspace");
  }, [label, titleState, t]);

  return null;
}

function noop() {}

function mobileTabMenuTriggerStyle({ open, pressed }: { open?: boolean; pressed?: boolean }) {
  return [
    styles.mobileTabMenuTrigger,
    (Boolean(open) || Boolean(pressed)) && styles.mobileTabMenuTriggerActive,
  ];
}

function switcherTriggerStyle({ pressed }: { pressed?: boolean }) {
  return [styles.switcherTrigger, Boolean(pressed) && styles.switcherTriggerPressed];
}

function MobileTabTrailingAccessory({
  menuTestIDBase,
  presentationLabel,
  menuEntries,
}: {
  menuTestIDBase: string;
  presentationLabel: string;
  menuEntries: WorkspaceTabMenuEntry[];
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID={`${menuTestIDBase}-trigger`}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.tabs.menu.openFor", { label: presentationLabel })}
        hitSlop={8}
        style={mobileTabMenuTriggerStyle}
      >
        <ThemedEllipsis size={14} uniProps={mutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" width={220} testID={menuTestIDBase}>
        {menuEntries.map((entry) =>
          entry.kind === "separator" ? (
            <DropdownMenuSeparator key={entry.key} />
          ) : (
            <MobileTabDropdownMenuItem key={entry.key} entry={entry} />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileTabDropdownMenuItem({
  entry,
}: {
  entry: Extract<WorkspaceTabMenuEntry, { kind: "item" }>;
}) {
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={16} uniProps={mutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={16} uniProps={mutedColorMapping} />;
      case "arrow-left-to-line":
        return <ThemedArrowLeftToLine size={16} uniProps={mutedColorMapping} />;
      case "arrow-right-to-line":
        return <ThemedArrowRightToLine size={16} uniProps={mutedColorMapping} />;
      case "copy-x":
        return <ThemedCopyX size={16} uniProps={mutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={16} uniProps={mutedColorMapping} />;
      case "x":
        return <ThemedX size={16} uniProps={mutedColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.menuItemHint}>{entry.hint}</Text> : undefined),
    [entry.hint],
  );
  return (
    <DropdownMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      tooltip={entry.tooltip}
      leading={leading}
      trailing={trailing}
    >
      {entry.label}
    </DropdownMenuItem>
  );
}

function MobileWorkspaceTabOption({
  tab,
  tabIndex,
  tabCount,
  normalizedServerId,
  normalizedWorkspaceId,
  selected,
  active,
  onPress,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTab,
  onCloseTabsAbove,
  onCloseTabsBelow,
  onCloseOtherTabs,
}: {
  tab: WorkspaceTabDescriptor;
  tabIndex: number;
  tabCount: number;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsAbove: (tabId: string) => Promise<void> | void;
  onCloseTabsBelow: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const tabMenuLabels = useMemo<WorkspaceTabMenuLabels>(
    () => ({
      copyResumeCommand: t("workspace.tabs.menu.copyResumeCommand"),
      copyAgentId: t("workspace.tabs.menu.copyAgentId"),
      copyFilePath: t("workspace.tabs.menu.copyFilePath"),
      rename: t("workspace.tabs.menu.rename"),
      closeAbove: t("workspace.tabs.menu.closeAbove"),
      closeBelow: t("workspace.tabs.menu.closeBelow"),
      closeLeft: t("workspace.tabs.menu.closeLeft"),
      closeRight: t("workspace.tabs.menu.closeRight"),
      closeOthers: t("workspace.tabs.menu.closeOthers"),
      reloadAgent: t("workspace.tabs.menu.reloadAgent"),
      reloadAgentTooltip: t("workspace.tabs.menu.reloadAgentTooltip"),
      close: t("workspace.tabs.menu.close"),
    }),
    [t],
  );
  const menuTestIDBase = `workspace-tab-menu-${buildDeterministicWorkspaceTabId(tab.target)}`;
  const menuEntries = buildWorkspaceTabMenuEntries({
    surface: "mobile",
    tab,
    index: tabIndex,
    tabCount,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onCopyFilePath,
    onReloadAgent,
    onRenameTab,
    onCloseTab,
    onCloseTabsBefore: onCloseTabsAbove,
    onCloseTabsAfter: onCloseTabsBelow,
    onCloseOtherTabs,
    labels: tabMenuLabels,
  });

  const fallbackLabels = useMemo(
    () => ({
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      browser: t("workspace.tabs.fallback.browser"),
      agent: t("workspace.tabs.fallback.agent"),
      review: t("workspace.tabs.toolsMenu.review"),
      files: t("workspace.tabs.toolsMenu.file"),
    }),
    [t],
  );
  const fallbackLabel = getFallbackTabOptionLabel(tab, fallbackLabels);
  const trailingAccessory = useMemo(
    () => (
      <MobileTabTrailingAccessory
        menuTestIDBase={menuTestIDBase}
        presentationLabel={fallbackLabel}
        menuEntries={menuEntries}
      />
    ),
    [menuTestIDBase, fallbackLabel, menuEntries],
  );

  const renderPresentation = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <WorkspaceTabOptionRow
        presentation={presentation}
        selected={selected}
        active={active}
        onPress={onPress}
        trailingAccessory={trailingAccessory}
      />
    ),
    [selected, active, onPress, trailingAccessory],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {renderPresentation}
    </WorkspaceTabPresentationResolver>
  );
}

const MobileWorkspaceTabSwitcher = memo(function MobileWorkspaceTabSwitcher({
  tabs,
  activeTabKey,
  activeTab,
  tabSwitcherOptions,
  tabByKey,
  normalizedServerId,
  normalizedWorkspaceId,
  onSelectSwitcherTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTab,
  onCloseTabsAbove,
  onCloseTabsBelow,
  onCloseOtherTabs,
}: MobileWorkspaceTabSwitcherProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<View>(null);
  const tabIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    tabs.forEach((tab, index) => {
      map.set(tab.key, index);
    });
    return map;
  }, [tabs]);

  const handleOpenSwitcher = useCallback(() => {
    Keyboard.dismiss();
    setIsOpen(true);
  }, []);

  const renderTabOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const tab = tabByKey.get(option.id);
      if (!tab) {
        return <View />;
      }
      const tabIndex = tabIndexByKey.get(tab.key) ?? -1;
      if (tabIndex < 0) {
        return <View />;
      }
      return (
        <MobileWorkspaceTabOption
          tab={tab}
          tabIndex={tabIndex}
          tabCount={tabs.length}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          selected={selected}
          active={active}
          onPress={onPress}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onCopyFilePath={onCopyFilePath}
          onReloadAgent={onReloadAgent}
          onRenameTab={onRenameTab}
          onCloseTab={onCloseTab}
          onCloseTabsAbove={onCloseTabsAbove}
          onCloseTabsBelow={onCloseTabsBelow}
          onCloseOtherTabs={onCloseOtherTabs}
        />
      );
    },
    [
      tabByKey,
      tabIndexByKey,
      tabs.length,
      normalizedServerId,
      normalizedWorkspaceId,
      onCopyResumeCommand,
      onCopyAgentId,
      onCopyFilePath,
      onReloadAgent,
      onRenameTab,
      onCloseTab,
      onCloseTabsAbove,
      onCloseTabsBelow,
      onCloseOtherTabs,
    ],
  );

  return (
    <View style={styles.mobileTabsRow} testID="workspace-tabs-row">
      <Pressable
        ref={anchorRef}
        testID="workspace-tab-switcher-trigger"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.tabs.switcher.trigger", { count: tabs.length })}
        style={switcherTriggerStyle}
        onPress={handleOpenSwitcher}
      >
        <View style={styles.switcherTriggerLeft}>
          <MobileActiveTabTrigger
            activeTab={activeTab}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
          />
        </View>
        <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
      </Pressable>

      <Combobox
        options={tabSwitcherOptions}
        value={activeTabKey}
        onSelect={onSelectSwitcherTab}
        searchable={false}
        title={t("workspace.tabs.switcher.title")}
        searchPlaceholder={t("workspace.tabs.switcher.searchPlaceholder")}
        open={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={anchorRef}
        renderOption={renderTabOption}
      />
    </View>
  );
});

interface MobileMountedTabSlotProps {
  tabDescriptor: WorkspaceTabDescriptor;
  isVisible: boolean;
  isWorkspaceFocused: boolean;
  isPaneFocused: boolean;
  paneId: string | null;
  buildPaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

const MobileMountedTabSlot = memo(function MobileMountedTabSlot({
  tabDescriptor,
  isVisible,
  isWorkspaceFocused,
  isPaneFocused,
  paneId,
  buildPaneContentModel,
}: MobileMountedTabSlotProps) {
  const content = useMemo(
    () =>
      buildPaneContentModel({
        paneId,
        tab: tabDescriptor,
      }),
    [buildPaneContentModel, paneId, tabDescriptor],
  );

  const slotStyle = isVisible
    ? styles.mobileMountedTabSlotVisible
    : styles.mobileMountedTabSlotHidden;

  return (
    <RenderProfile id={`MobileMountedTabSlot:${tabDescriptor.kind}:${tabDescriptor.tabId}`}>
      <MountedTabActiveContext value={isVisible}>
        <View style={slotStyle} pointerEvents={isVisible ? "auto" : "none"}>
          <WorkspacePaneContent
            content={content}
            isWorkspaceFocused={isWorkspaceFocused}
            isPaneFocused={isPaneFocused}
          />
        </View>
      </MountedTabActiveContext>
    </RenderProfile>
  );
});

function useStableTabDescriptorMap(tabDescriptors: WorkspaceTabDescriptor[]) {
  const cacheRef = useRef(new Map<string, WorkspaceTabDescriptor>());
  const tabDescriptorMap = useMemo(() => {
    const next = new Map<string, WorkspaceTabDescriptor>();
    for (const tabDescriptor of tabDescriptors) {
      const cachedDescriptor = cacheRef.current.get(tabDescriptor.tabId);
      if (
        cachedDescriptor &&
        cachedDescriptor.key === tabDescriptor.key &&
        cachedDescriptor.kind === tabDescriptor.kind &&
        workspaceTabTargetsEqual(cachedDescriptor.target, tabDescriptor.target)
      ) {
        next.set(tabDescriptor.tabId, cachedDescriptor);
        continue;
      }
      next.set(tabDescriptor.tabId, tabDescriptor);
    }
    return next;
  }, [tabDescriptors]);
  useEffect(() => {
    cacheRef.current = tabDescriptorMap;
  }, [tabDescriptorMap]);

  return tabDescriptorMap;
}

export const WorkspaceScreen = memo(function WorkspaceScreen({
  serverId,
  workspaceId,
  isRouteFocused,
}: WorkspaceScreenProps) {
  const navigationFocused = useIsFocused();
  const effectiveRouteFocused = isRouteFocused ?? navigationFocused;

  return (
    <WorkspaceScreenContent
      serverId={serverId}
      workspaceId={workspaceId}
      isRouteFocused={effectiveRouteFocused}
    />
  );
});

interface UseCloseTabsResult {
  closingTabIds: Set<string>;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

function useCloseTabs(): UseCloseTabsResult {
  const pendingRef = useRef(new Set<string>());
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(EMPTY_SET);

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    setClosingTabIds(new Set(pendingRef.current));
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
      setClosingTabIds(new Set(pendingRef.current));
    }
  }, []);

  return { closingTabIds, closeTab };
}

interface WorkspaceHeaderMenuProps {
  normalizedServerId: string;
  currentBranchName: string | null;
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  showReviewAction: boolean;
  isMobile: boolean;
  createTerminalDisabled: boolean;
  importAgentDisabled: boolean;
  copyPathDisabled: boolean;
  menuNewAgentIcon: ReactElement;
  menuNewTerminalIcon: ReactElement;
  menuNewBrowserIcon: ReactElement;
  menuReviewIcon: ReactElement;
  menuFileIcon: ReactElement;
  menuSideChatIcon: ReactElement;
  menuImportIcon: ReactElement;
  menuCopyIcon: ReactElement;
  menuSettingsIcon: ReactElement;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateTerminalWithProfile: (profile: TerminalProfileInput) => void;
  onCreateBrowser: () => void;
  onOpenReview: () => void;
  onOpenFile: () => void;
  onCreateSideChat: () => void;
  onOpenImportSheet: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
}
interface HeaderMenuProfileItemProps {
  profile: { id: string; name: string; command: string; args?: string[]; icon?: string };
  disabled: boolean;
  onCreateTerminalWithProfile: (profile: TerminalProfileInput) => void;
}

function HeaderMenuProfileItem({
  profile,
  disabled,
  onCreateTerminalWithProfile,
}: HeaderMenuProfileItemProps) {
  const handleSelect = useCallback(() => {
    onCreateTerminalWithProfile({
      name: profile.name,
      command: profile.command,
      args: profile.args,
    });
  }, [onCreateTerminalWithProfile, profile]);

  const icon = getTerminalProfileIcon(profile);

  const leading = useMemo(() => {
    if (!icon) {
      return (
        <View style={styles.headerMenuProfileIconWrapper}>
          <ThemedSquareTerminal size={16} uniProps={mutedColorMapping} />
        </View>
      );
    }
    return (
      <View style={styles.headerMenuProfileIconWrapper}>
        <ThemedDynamicProviderIcon iconKey={icon} size={16} uniProps={mutedColorMapping} />
      </View>
    );
  }, [icon]);

  return (
    <DropdownMenuItem leading={leading} disabled={disabled} onSelect={handleSelect}>
      {profile.name}
    </DropdownMenuItem>
  );
}

function WorkspaceHeaderMenuTriggerIcon({
  hovered,
  open,
  isMobile,
}: {
  hovered: boolean;
  open: boolean;
  isMobile: boolean;
}) {
  const Icon = isMobile ? ThemedEllipsisVertical : ThemedEllipsis;
  const colorMapping = hovered || open ? foregroundColorMapping : mutedColorMapping;
  return <Icon size={16} uniProps={colorMapping} />;
}

function WorkspaceHeaderMenu({
  normalizedServerId,
  currentBranchName,
  showWorkspaceSetup,
  showCreateBrowserTab,
  showReviewAction,
  isMobile,
  createTerminalDisabled,
  importAgentDisabled,
  copyPathDisabled,
  menuNewAgentIcon,
  menuNewTerminalIcon,
  menuNewBrowserIcon,
  menuReviewIcon,
  menuFileIcon,
  menuSideChatIcon,
  menuImportIcon,
  menuCopyIcon,
  menuSettingsIcon,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateTerminalWithProfile,
  onCreateBrowser,
  onOpenReview,
  onOpenFile,
  onCreateSideChat,
  onOpenImportSheet,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
}: WorkspaceHeaderMenuProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { config } = useDaemonConfig(normalizedServerId);
  const profiles = useMemo(
    () => resolveTerminalProfiles(config?.terminalProfiles),
    [config?.terminalProfiles],
  );

  const handleEditProfiles = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(normalizedServerId, "terminals") as Href);
  }, [normalizedServerId, router]);

  const renderTriggerIcon = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => (
      <WorkspaceHeaderMenuTriggerIcon hovered={hovered} open={open} isMobile={isMobile} />
    ),
    [isMobile],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="workspace-header-menu-trigger"
        style={isMobile ? styles.compactHeaderActionButton : styles.headerActionButton}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.header.actions.workspaceActions")}
      >
        {renderTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={220} testID="workspace-header-menu">
        <DropdownMenuItem
          testID="workspace-header-new-agent"
          leading={menuNewAgentIcon}
          onSelect={onCreateDraftTab}
        >
          {t("workspace.header.actions.newAgent")}
        </DropdownMenuItem>
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-header-new-browser"
            leading={menuNewBrowserIcon}
            onSelect={onCreateBrowser}
          >
            {t("workspace.header.actions.newBrowser")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID="workspace-header-new-side-chat"
          leading={menuSideChatIcon}
          onSelect={onCreateSideChat}
        >
          {t("workspace.header.actions.newSideChat")}
        </DropdownMenuItem>
        {showReviewAction ? (
          <DropdownMenuItem
            testID="workspace-header-review"
            leading={menuReviewIcon}
            onSelect={onOpenReview}
          >
            {t("workspace.header.actions.review")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID="workspace-header-open-file"
          leading={menuFileIcon}
          onSelect={onOpenFile}
        >
          {t("workspace.header.actions.newFile")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="workspace-header-import-agent"
          leading={menuImportIcon}
          disabled={importAgentDisabled}
          onSelect={onOpenImportSheet}
        >
          {t("workspace.header.actions.importSession")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="workspace-header-copy-path"
          leading={menuCopyIcon}
          disabled={copyPathDisabled}
          onSelect={onCopyWorkspacePath}
        >
          {t("workspace.header.actions.copyPath")}
        </DropdownMenuItem>
        {currentBranchName ? (
          <DropdownMenuItem
            testID="workspace-header-copy-branch-name"
            leading={menuCopyIcon}
            onSelect={onCopyBranchName}
          >
            {t("workspace.header.actions.copyBranchName")}
          </DropdownMenuItem>
        ) : null}
        {showWorkspaceSetup ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              testID="workspace-header-show-setup"
              leading={menuSettingsIcon}
              onSelect={onOpenSetupTab}
            >
              {t("workspace.header.actions.showSetup")}
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("workspace.tabs.actions.terminalProfilesMenu")}</DropdownMenuLabel>
        <DropdownMenuItem
          testID="workspace-header-new-terminal"
          leading={menuNewTerminalIcon}
          disabled={createTerminalDisabled}
          onSelect={onCreateTerminal}
        >
          {t("workspace.header.actions.newTerminal")}
        </DropdownMenuItem>
        {profiles.map((profile) => (
          <HeaderMenuProfileItem
            key={profile.id}
            profile={profile}
            disabled={createTerminalDisabled}
            onCreateTerminalWithProfile={onCreateTerminalWithProfile}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          testID="workspace-header-edit-terminal-profiles"
          onSelect={handleEditProfiles}
        >
          {t("workspace.tabs.actions.editTerminalProfiles")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorkspaceHeaderTitleBarProps {
  isLoading: boolean;
  title: string;
  subtitle: string;
  showSubtitle: boolean;
  currentBranchName: string | null;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  workspaceScripts: WorkspaceDescriptor["scripts"];
  liveTerminalIds: string[];
  showWorkspaceSetup: boolean;
  showCreateBrowserTab: boolean;
  showReviewAction: boolean;
  isMobile: boolean;
  createTerminalDisabled: boolean;
  importAgentDisabled: boolean;
  copyPathDisabled: boolean;
  menuNewAgentIcon: ReactElement;
  menuNewTerminalIcon: ReactElement;
  menuNewBrowserIcon: ReactElement;
  menuReviewIcon: ReactElement;
  menuFileIcon: ReactElement;
  menuSideChatIcon: ReactElement;
  menuImportIcon: ReactElement;
  menuCopyIcon: ReactElement;
  menuSettingsIcon: ReactElement;
  onCreateDraftTab: () => void;
  onCreateTerminal: () => void;
  onCreateTerminalWithProfile: (profile: TerminalProfileInput) => void;
  onCreateBrowser: () => void;
  onOpenReview: () => void;
  onOpenFile: () => void;
  onCreateSideChat: () => void;
  onOpenImportSheet: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
  onScriptTerminalStarted: (terminalId: string) => void;
  onViewScriptTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab: (url: string) => void;
}

function WorkspaceHeaderTitleBar({
  isLoading,
  title,
  subtitle,
  showSubtitle,
  currentBranchName,
  normalizedServerId,
  normalizedWorkspaceId,
  workspaceScripts,
  liveTerminalIds,
  showWorkspaceSetup,
  showCreateBrowserTab,
  showReviewAction,
  isMobile,
  createTerminalDisabled,
  importAgentDisabled,
  copyPathDisabled,
  menuNewAgentIcon,
  menuNewTerminalIcon,
  menuNewBrowserIcon,
  menuReviewIcon,
  menuFileIcon,
  menuSideChatIcon,
  menuImportIcon,
  menuCopyIcon,
  menuSettingsIcon,
  onCreateDraftTab,
  onCreateTerminal,
  onCreateTerminalWithProfile,
  onCreateBrowser,
  onOpenReview,
  onOpenFile,
  onCreateSideChat,
  onOpenImportSheet,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
  onScriptTerminalStarted,
  onViewScriptTerminal,
  onOpenUrlInBrowserTab,
}: WorkspaceHeaderTitleBarProps) {
  return (
    <View style={styles.headerTitleContainer}>
      {isLoading ? (
        <View style={styles.headerTitleTextGroup}>
          <View style={styles.headerTitleSkeleton} />
        </View>
      ) : (
        <View style={styles.headerTitleTextGroup}>
          <ScreenTitle testID="workspace-header-title">{title}</ScreenTitle>
          {showSubtitle ? (
            <Text
              testID="workspace-header-subtitle"
              style={styles.headerProjectTitle}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
      <View style={styles.compactHeaderMenuCluster}>
        <WorkspaceHeaderMenu
          normalizedServerId={normalizedServerId}
          currentBranchName={currentBranchName}
          showWorkspaceSetup={showWorkspaceSetup}
          showCreateBrowserTab={showCreateBrowserTab}
          showReviewAction={showReviewAction}
          isMobile={isMobile}
          createTerminalDisabled={createTerminalDisabled}
          importAgentDisabled={importAgentDisabled}
          copyPathDisabled={copyPathDisabled}
          menuNewAgentIcon={menuNewAgentIcon}
          menuNewTerminalIcon={menuNewTerminalIcon}
          menuNewBrowserIcon={menuNewBrowserIcon}
          menuReviewIcon={menuReviewIcon}
          menuFileIcon={menuFileIcon}
          menuSideChatIcon={menuSideChatIcon}
          menuImportIcon={menuImportIcon}
          menuCopyIcon={menuCopyIcon}
          menuSettingsIcon={menuSettingsIcon}
          onCreateDraftTab={onCreateDraftTab}
          onCreateTerminal={onCreateTerminal}
          onCreateTerminalWithProfile={onCreateTerminalWithProfile}
          onCreateBrowser={onCreateBrowser}
          onOpenReview={onOpenReview}
          onOpenFile={onOpenFile}
          onCreateSideChat={onCreateSideChat}
          onOpenImportSheet={onOpenImportSheet}
          onCopyWorkspacePath={onCopyWorkspacePath}
          onCopyBranchName={onCopyBranchName}
          onOpenSetupTab={onOpenSetupTab}
        />
        {SHOW_WORKSPACE_SCRIPTS_BUTTON && isMobile && workspaceScripts.length > 0 ? (
          <WorkspaceScriptsButton
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
            scripts={workspaceScripts}
            liveTerminalIds={liveTerminalIds}
            onScriptTerminalStarted={onScriptTerminalStarted}
            onViewTerminal={onViewScriptTerminal}
            onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
            hideLabels
            presentation="ghost"
          />
        ) : null}
      </View>
    </View>
  );
}

function WorkspaceToolPanelToggle({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const label = isOpen ? t("workspace.tabs.toolPanel.close") : t("workspace.tabs.toolPanel.open");
  const colorMappingFor = (active: boolean) =>
    active || isOpen ? foregroundColorMapping : mutedColorMapping;

  return (
    <HeaderToggleButton
      testID="workspace-tool-panel-toggle"
      onPress={onToggle}
      tooltipLabel={label}
      tooltipKeys={TOOL_PANEL_TOGGLE_KEYS}
      tooltipSide="left"
      style={styles.compactHeaderActionButton}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={isOpen ? TOOL_PANEL_TOGGLE_OPEN_STATE : TOOL_PANEL_TOGGLE_CLOSED_STATE}
    >
      {({ hovered }) => <ThemedPanelRight size={16} uniProps={colorMappingFor(hovered)} />}
    </HeaderToggleButton>
  );
}

function WorkspaceMaximizeToggle({
  isMaximized,
  onToggle,
}: {
  isMaximized: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = isMaximized
    ? t("workspace.tabs.toolPanel.restore")
    : t("workspace.tabs.toolPanel.maximize");
  return (
    <HeaderToggleButton
      testID="workspace-tool-panel-maximize"
      onPress={onToggle}
      tooltipLabel={label}
      tooltipKeys={EMPTY_SHORTCUT_KEYS}
      tooltipSide="left"
      style={styles.compactHeaderActionButton}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {({ hovered }) =>
        isMaximized ? (
          <ThemedMinimize2
            size={16}
            uniProps={hovered ? foregroundColorMapping : mutedColorMapping}
          />
        ) : (
          <ThemedMaximize2
            size={16}
            uniProps={hovered ? foregroundColorMapping : mutedColorMapping}
          />
        )
      }
    </HeaderToggleButton>
  );
}

function resolveRelativeTabId(
  tabs: WorkspaceTabDescriptor[],
  activeTabId: string | null,
  delta: number,
): string | null {
  if (tabs.length === 0) {
    return null;
  }
  const currentIndex = tabs.findIndex((tab) => tab.tabId === activeTabId);
  const fromIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (fromIndex + delta + tabs.length) % tabs.length;
  return tabs[nextIndex]?.tabId ?? null;
}

type PaneDirection = "left" | "right" | "up" | "down";

function parsePaneDirection(actionId: string): PaneDirection | null {
  const direction = actionId.split(".").pop();
  if (direction === "left" || direction === "right" || direction === "up" || direction === "down") {
    return direction;
  }
  return null;
}

interface RenderWorkspaceContentInput {
  isMissingWorkspaceDirectory: boolean;
  activeTabDescriptor: WorkspaceTabDescriptor | null;
  hasHydratedAgents: boolean;
  mountedFocusedPaneTabIds: string[];
  focusedPaneTabDescriptorMap: Map<string, WorkspaceTabDescriptor>;
  isRouteFocused: boolean;
  focusedPaneId: string | null;
  buildMobilePaneContentModel: (input: {
    paneId: string | null;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
}

function renderWorkspaceContent(input: RenderWorkspaceContentInput): React.ReactNode {
  const {
    isMissingWorkspaceDirectory,
    activeTabDescriptor,
    hasHydratedAgents,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    buildMobilePaneContentModel,
  } = input;

  if (isMissingWorkspaceDirectory) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          Workspace directory is missing. Reload workspace data before opening tabs.
        </Text>
      </View>
    );
  }
  if (!activeTabDescriptor && !hasHydratedAgents) {
    return (
      <View style={styles.emptyState}>
        <ThemedActivityIndicator uniProps={mutedColorMapping} />
      </View>
    );
  }
  if (!activeTabDescriptor) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          No tabs are available yet. Use New tab to create an agent or terminal.
        </Text>
      </View>
    );
  }
  return mountedFocusedPaneTabIds.map((tabId) => {
    const tabDescriptor = focusedPaneTabDescriptorMap.get(tabId);
    if (!tabDescriptor) {
      return null;
    }
    return (
      <MobileMountedTabSlot
        key={tabId}
        tabDescriptor={tabDescriptor}
        isVisible={isRouteFocused && tabId === activeTabDescriptor.tabId}
        isWorkspaceFocused={isRouteFocused}
        isPaneFocused={tabId === activeTabDescriptor.tabId}
        paneId={focusedPaneId}
        buildPaneContentModel={buildMobilePaneContentModel}
      />
    );
  });
}

interface WorkspaceHeaderFields {
  isWorkspaceHeaderLoading: boolean;
  workspaceHeaderTitle: string;
  workspaceHeaderSubtitle: string;
  shouldShowWorkspaceHeaderSubtitle: boolean;
  isGitCheckout: boolean;
  currentBranchName: string | null;
}

function buildWorkspaceHeaderCheckoutState(input: {
  isCheckoutStatusLoading: boolean;
  isError: boolean;
  data: CheckoutStatusPayload | undefined;
}): WorkspaceHeaderCheckoutState {
  if (input.isCheckoutStatusLoading) {
    return { kind: "pending" };
  }
  if (input.isError || !input.data) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    checkout: {
      isGit: input.data.isGit,
      currentBranch: input.data.currentBranch,
    },
  };
}

function deriveWorkspaceHeaderFields(input: {
  workspace: WorkspaceDescriptor | null;
  checkoutState: WorkspaceHeaderCheckoutState;
}): WorkspaceHeaderFields {
  const renderState = resolveWorkspaceHeaderRenderState(input);
  if (renderState.kind !== "ready") {
    return {
      isWorkspaceHeaderLoading: true,
      workspaceHeaderTitle: "",
      workspaceHeaderSubtitle: "",
      shouldShowWorkspaceHeaderSubtitle: false,
      isGitCheckout: false,
      currentBranchName: null,
    };
  }
  return {
    isWorkspaceHeaderLoading: false,
    workspaceHeaderTitle: renderState.title,
    workspaceHeaderSubtitle: renderState.subtitle,
    shouldShowWorkspaceHeaderSubtitle: renderState.shouldShowSubtitle,
    isGitCheckout: renderState.isGitCheckout,
    currentBranchName: renderState.currentBranchName,
  };
}

function getHostDisplayName(host: { label?: string | null } | null, fallback: string): string {
  const trimmed = host?.label?.trim();
  return trimmed ? trimmed : fallback;
}

function useWorkspaceRouteActions(normalizedServerId: string): {
  handleRetryHost: () => void;
  handleManageHost: () => void;
  handleDismissMissingWorkspace: () => void;
} {
  const router = useRouter();
  const handleRetryHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    void getHostRuntimeStore().runProbeCycleNow(normalizedServerId);
  }, [normalizedServerId]);
  const handleManageHost = useCallback(() => {
    if (!normalizedServerId) {
      return;
    }
    router.push(buildSettingsHostRoute(normalizedServerId) as Href);
  }, [normalizedServerId, router]);
  const handleDismissMissingWorkspace = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (normalizedServerId) {
      router.replace(buildHostRootRoute(normalizedServerId) as Href);
      return;
    }
    router.replace("/" as Href);
  }, [normalizedServerId, router]);

  return {
    handleRetryHost,
    handleManageHost,
    handleDismissMissingWorkspace,
  };
}

function useResolvedWorkspaceRouteState(input: {
  serverId: string;
  workspaceId: string;
  workspace: WorkspaceDescriptor | null;
  hasHydratedWorkspaces: boolean;
}): WorkspaceRouteState {
  const hosts = useHosts();
  const host = useMemo(
    () => hosts.find((entry) => entry.serverId === input.serverId) ?? null,
    [hosts, input.serverId],
  );
  const hostSnapshot = useHostRuntimeSnapshot(input.serverId);
  const hostName = useMemo(() => getHostDisplayName(host, input.serverId), [host, input.serverId]);
  const restoreStatus = useWorkspaceRestoreStatus(input.serverId, input.workspaceId);

  return useMemo(
    () =>
      resolveWorkspaceRouteState({
        hostName,
        connectionStatus: hostSnapshot?.connectionStatus ?? "connecting",
        lastError: hostSnapshot?.lastError ?? null,
        workspace: input.workspace,
        hasHydratedWorkspaces: input.hasHydratedWorkspaces,
        restoreStatus,
      }),
    [
      hostName,
      hostSnapshot?.connectionStatus,
      hostSnapshot?.lastError,
      input.workspace,
      input.hasHydratedWorkspaces,
      restoreStatus,
    ],
  );
}

function WorkspaceScreenGateFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <ScreenHeader left={GATED_WORKSPACE_HEADER_LEFT} />
      <View style={styles.centerContent}>{children}</View>
    </>
  );
}

function renderWorkspaceScreenGateShell(input: {
  gate: ReactNode;
  workspaceKey: string | null;
}): ReactElement | null {
  if (!input.gate) {
    return null;
  }

  return (
    <WorkspaceFocusProvider workspaceKey={input.workspaceKey}>
      <View style={styles.container}>
        <View style={styles.threePaneRow}>
          <View style={styles.centerColumn}>
            <WorkspaceScreenGateFrame>{input.gate}</WorkspaceScreenGateFrame>
          </View>
        </View>
      </View>
    </WorkspaceFocusProvider>
  );
}

function WorkspaceDocumentTitleEffectSlot({
  tab,
  serverId,
  workspaceId,
  isRouteFocused,
}: {
  tab: WorkspaceTabDescriptor | null;
  serverId: string;
  workspaceId: string;
  isRouteFocused: boolean;
}) {
  if (!isRouteFocused || !isWeb || !tab) {
    return null;
  }

  return (
    <WorkspaceTabPresentationResolver tab={tab} serverId={serverId} workspaceId={workspaceId}>
      {(presentation) => (
        <WorkspaceDocumentTitleEffect
          label={presentation.label}
          titleState={presentation.titleState}
        />
      )}
    </WorkspaceTabPresentationResolver>
  );
}

function shouldShowWorkspaceScreenHeader(input: {
  isFocusModeEnabled: boolean;
  isMobile: boolean;
}): boolean {
  return !input.isFocusModeEnabled || input.isMobile;
}

function buildWorkspaceTerminalScopeKey(serverId: string, workspaceId: string): string | null {
  if (!serverId || !workspaceId) {
    return null;
  }
  return `${serverId}:${workspaceId}`;
}

interface WorkspaceTerminalTabActionsInput {
  persistenceKey: string | null;
  focusWorkspacePane: (workspaceKey: string, paneId: string) => void;
  openWorkspaceTabFocused: (workspaceKey: string, target: WorkspaceTabTarget) => string | null;
  labels: {
    workspacePathUnavailable: string;
    terminalQueued: string;
  };
  toast: {
    error: (message: string) => void;
    show: (message: string) => void;
  };
}

interface WorkspaceTerminalTabActions {
  handleTerminalCreated: (input: { terminalId: string; paneId?: string }) => void;
  handleScriptTerminalSelected: (terminalId: string) => void;
  handleWorkspacePathUnavailable: () => void;
  handleTerminalCreateQueued: () => void;
  handleTerminalCreateFailed: (reason: string) => void;
}

function useWorkspaceTerminalTabActions({
  persistenceKey,
  focusWorkspacePane,
  openWorkspaceTabFocused,
  labels,
  toast,
}: WorkspaceTerminalTabActionsInput): WorkspaceTerminalTabActions {
  const handleTerminalCreated = useCallback(
    ({ terminalId, paneId }: { terminalId: string; paneId?: string }) => {
      if (!persistenceKey) {
        return;
      }
      if (paneId) {
        focusWorkspacePane(persistenceKey, paneId);
      }
      openWorkspaceTabFocused(persistenceKey, { kind: "terminal", terminalId });
    },
    [focusWorkspacePane, openWorkspaceTabFocused, persistenceKey],
  );
  const handleScriptTerminalSelected = useCallback(
    (terminalId: string) => {
      if (!persistenceKey) {
        return;
      }
      openWorkspaceTabFocused(persistenceKey, { kind: "terminal", terminalId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );
  const handleWorkspacePathUnavailable = useCallback(() => {
    toast.error(labels.workspacePathUnavailable);
  }, [labels.workspacePathUnavailable, toast]);
  const handleTerminalCreateQueued = useCallback(() => {
    toast.show(labels.terminalQueued);
  }, [labels.terminalQueued, toast]);
  const handleTerminalCreateFailed = useCallback(
    (reason: string) => {
      toast.error(reason);
    },
    [toast],
  );

  return {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
    handleTerminalCreateFailed,
  };
}

function useWorkspaceCheckoutStatus(input: {
  client: ReturnType<typeof useHostRuntimeClient>;
  isConnected: boolean;
  isRouteFocused: boolean;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  workspaceDirectory: string | null;
}) {
  const { t } = useTranslation();
  const isCheckoutQueryEnabled = useMemo(
    () =>
      canCreateWorkspaceTerminal({
        isRouteFocused: input.isRouteFocused,
        client: input.client,
        isConnected: input.isConnected,
        workspaceDirectory: input.workspaceDirectory,
      }),
    [input.isRouteFocused, input.client, input.isConnected, input.workspaceDirectory],
  );
  const checkoutQuery = useQuery({
    queryKey: checkoutStatusQueryKey(
      input.normalizedServerId,
      input.workspaceDirectory ?? `missing-workspace-directory:${input.normalizedWorkspaceId}`,
    ),
    enabled: isCheckoutQueryEnabled,
    queryFn: async () => {
      if (!input.client || !input.workspaceDirectory) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      return await fetchCheckoutStatus({
        client: input.client,
        serverId: input.normalizedServerId,
        cwd: input.workspaceDirectory,
      });
    },
    staleTime: Infinity,
    // Refetch on mount only after explicit invalidation (e.g. reconnect) — see
    // useCheckoutStatusQuery for the rationale.
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const isCheckoutStatusLoading = useMemo(
    () => isCheckoutQueryEnabled && checkoutQuery.data === undefined && !checkoutQuery.isError,
    [isCheckoutQueryEnabled, checkoutQuery.data, checkoutQuery.isError],
  );

  return { checkoutQuery, isCheckoutStatusLoading };
}

function WorkspaceScreenContent({
  serverId,
  workspaceId,
  isRouteFocused,
}: WorkspaceScreenContentProps) {
  const { t } = useTranslation();
  const _insets = useSafeAreaInsets();
  const toast = useToast();
  const isMobile = useIsCompactFormFactor();
  const isFocusModeEnabled = usePanelStore((state) => state.desktop.focusModeEnabled);

  const normalizedServerId = useMemo(() => trimNonEmpty(decodeSegment(serverId)) ?? "", [serverId]);

  const normalizedWorkspaceId = useMemo(
    () => resolveWorkspaceRouteId({ routeWorkspaceId: workspaceId }) ?? "",
    [workspaceId],
  );
  const workspaceDescriptor = useWorkspace(normalizedServerId, normalizedWorkspaceId);
  const workspaceScripts = getWorkspaceScripts(workspaceDescriptor);
  const { handleRetryHost, handleManageHost, handleDismissMissingWorkspace } =
    useWorkspaceRouteActions(normalizedServerId);

  const workspaceTerminalScopeKey = useMemo(
    () => buildWorkspaceTerminalScopeKey(normalizedServerId, normalizedWorkspaceId),
    [normalizedServerId, normalizedWorkspaceId],
  );
  useWorkspaceTerminalSessionRetention({
    scopeKey: workspaceTerminalScopeKey,
  });

  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const workspaceDirectory = workspaceDescriptor?.workspaceDirectory || null;
  const isMissingWorkspaceDirectory = Boolean(workspaceDescriptor) && !workspaceDirectory;
  const [isImportSheetVisible, setIsImportSheetVisible] = useState(false);
  const canOpenImportSheet = [client, isConnected, workspaceDirectory].every(Boolean);
  const openImportSheet = useCallback(() => {
    setIsImportSheetVisible(true);
  }, []);
  const closeImportSheet = useCallback(() => {
    setIsImportSheetVisible(false);
  }, []);

  // Warm the workspace-scoped provider snapshot so the model picker is ready when opened.
  useProvidersSnapshot(normalizedServerId, {
    cwd: workspaceDirectory,
    enabled: isRouteFocused,
  });

  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: normalizedServerId,
        workspaceId: normalizedWorkspaceId,
      }),
    [normalizedServerId, normalizedWorkspaceId],
  );
  const openWorkspaceTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const openWorkspaceChildTabFocused = useWorkspaceLayoutStore(
    (state) => state.openChildTabFocused,
  );
  const focusWorkspacePane = useWorkspaceLayoutStore((state) => state.focusPane);
  const hasHydratedWorkspaces = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedWorkspaces ?? false,
  );

  const workspaceAgentVisibility = useStoreWithEqualityFn(
    useSessionStore,
    (state) =>
      deriveWorkspaceAgentVisibility({
        sessionAgents: state.sessions[normalizedServerId]?.agents,
        agentDetails: state.sessions[normalizedServerId]?.agentDetails,
        workspaceId: normalizedWorkspaceId,
      }),
    workspaceAgentVisibilityEqual,
  );

  const {
    handleTerminalCreated,
    handleScriptTerminalSelected,
    handleWorkspacePathUnavailable,
    handleTerminalCreateQueued,
    handleTerminalCreateFailed,
  } = useWorkspaceTerminalTabActions({
    persistenceKey,
    focusWorkspacePane,
    openWorkspaceTabFocused,
    labels: {
      workspacePathUnavailable: t("workspace.header.toasts.workspacePathUnavailable"),
      terminalQueued: t("workspace.header.toasts.terminalQueued"),
    },
    toast,
  });
  const queryClient = useQueryClient();
  const {
    createMutation: createTerminalMutation,
    createTerminal,
    handleScriptTerminalStarted,
    handleViewScriptTerminal,
    invalidateTerminals,
    killMutation: killTerminalMutation,
    knownTerminalIds,
    liveTerminalIds,
    pendingCreateInput: pendingTerminalCreateInput,
    query: terminalsQuery,
    queryKey: terminalsQueryKey,
    removeTerminalFromCache,
    standaloneTerminalIds,
    terminals,
  } = useWorkspaceTerminals({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
    workspaceScripts,
    hasHydratedWorkspaces,
    isMissingWorkspaceDirectory,
    onTerminalCreated: handleTerminalCreated,
    onScriptTerminalSelected: handleScriptTerminalSelected,
    onWorkspacePathUnavailable: handleWorkspacePathUnavailable,
    onTerminalCreateQueued: handleTerminalCreateQueued,
    onTerminalCreateFailed: handleTerminalCreateFailed,
  });
  const { archiveAgent } = useArchiveAgent();

  const { checkoutQuery, isCheckoutStatusLoading } = useWorkspaceCheckoutStatus({
    client,
    isConnected,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    workspaceDirectory,
  });
  const hasHydratedAgents = useSessionStore(
    (state) => state.sessions[normalizedServerId]?.hasHydratedAgents ?? false,
  );
  const workspaceRouteState = useResolvedWorkspaceRouteState({
    serverId: normalizedServerId,
    workspaceId: normalizedWorkspaceId,
    workspace: workspaceDescriptor,
    hasHydratedWorkspaces,
  });
  const workspaceHeaderCheckoutState = buildWorkspaceHeaderCheckoutState({
    isCheckoutStatusLoading,
    isError: checkoutQuery.isError,
    data: checkoutQuery.data,
  });
  const {
    isWorkspaceHeaderLoading,
    workspaceHeaderTitle,
    workspaceHeaderSubtitle,
    shouldShowWorkspaceHeaderSubtitle,
    isGitCheckout,
    currentBranchName,
  } = deriveWorkspaceHeaderFields({
    workspace: workspaceDescriptor,
    checkoutState: workspaceHeaderCheckoutState,
  });

  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);

  const hasDiffStat = useMemo(() => Boolean(workspaceDescriptor?.diffStat), [workspaceDescriptor]);
  const reviewToggleStyle = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
      styles.sourceControlButton,
      hasDiffStat && styles.sourceControlButtonWithStats,
      (Boolean(hovered) || Boolean(pressed)) && styles.sourceControlButtonHovered,
    ],
    [hasDiffStat],
  );

  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const hasHydratedWorkspaceLayoutStore = useWorkspaceLayoutStoreHydrated();
  const workspaceSetupSnapshot = useWorkspaceSetupStore((state) =>
    persistenceKey ? (state.snapshots[persistenceKey] ?? null) : null,
  );
  const ensureWorkspaceSetupStatus = useWorkspaceSetupStore((state) => state.ensureSetupStatus);
  const showWorkspaceSetup = shouldShowWorkspaceSetup(workspaceSetupSnapshot);
  const uiTabs = useMemo(
    () => (workspaceLayout ? collectAllTabs(workspaceLayout.root) : EMPTY_UI_TABS),
    [workspaceLayout],
  );
  useSyncWorkspaceActiveBrowser({ workspaceLayout, isRouteFocused });
  const openWorkspaceTabInBackground = useWorkspaceLayoutStore(
    (state) => state.openTabInBackground,
  );
  const focusWorkspaceTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);
  const retargetWorkspaceTab = useWorkspaceLayoutStore((state) => state.retargetTab);
  const reconcileWorkspaceTabs = useWorkspaceLayoutStore((state) => state.reconcileTabs);
  const splitWorkspacePane = useWorkspaceLayoutStore((state) => state.splitPane);
  const splitWorkspacePaneEmpty = useWorkspaceLayoutStore((state) => state.splitPaneEmpty);
  const moveWorkspaceTabToPane = useWorkspaceLayoutStore((state) => state.moveTabToPane);
  const paneFocusSuppressedRef = useRef(false);
  const resizeWorkspaceSplit = useWorkspaceLayoutStore((state) => state.resizeSplit);
  const reorderWorkspaceTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const openRightToolPanel = useWorkspaceLayoutStore((state) => state.openRightToolPanel);
  const closeRightToolPanel = useWorkspaceLayoutStore((state) => state.closeRightToolPanel);
  const clearRightToolPanel = useWorkspaceLayoutStore((state) => state.clearRightToolPanel);
  const setRightToolPanelMaximized = useWorkspaceLayoutStore(
    (state) => state.setRightToolPanelMaximized,
  );
  const isRightToolPanelCollapsed = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.rightToolPanelCollapsedByWorkspace[persistenceKey] ?? false) : false,
  );
  const isRightToolPanelMaximized = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.rightToolPanelMaximizedByWorkspace[persistenceKey] ?? false) : false,
  );
  const isRightToolPanelOpenForWorkspace =
    isRightToolPanelOpen(workspaceLayout) && !isRightToolPanelCollapsed;
  // When collapsed, render the layout without the tools pane (keeps its tabs in the store so
  // re-expanding restores them). See docs/specs/2026-06-23-unified-topbar-redesign.md.
  const workspaceRenderLayout = useMemo(() => {
    if (!workspaceLayout) {
      return workspaceLayout;
    }
    if (isRightToolPanelMaximized) {
      return keepOnlyRightToolPanelInLayout(workspaceLayout);
    }
    if (isRightToolPanelCollapsed) {
      return removeRightToolPanelFromLayout(workspaceLayout);
    }
    return workspaceLayout;
  }, [workspaceLayout, isRightToolPanelCollapsed, isRightToolPanelMaximized]);
  // E: switching workspaces clears the right panel — leaving a workspace removes its tools tabs so
  // re-entering starts fresh. Within a session collapse keeps tabs (D); only switch / manual close clears.
  useEffect(() => {
    if (!isRouteFocused || !persistenceKey) {
      return;
    }
    // Cleared when this workspace stops being the active route (switched away) or unmounts — E.
    return () => {
      clearRightToolPanel(persistenceKey);
    };
  }, [isRouteFocused, persistenceKey, clearRightToolPanel]);
  const showCreateBrowserTab = getIsElectron();
  const _pinnedAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey
      ? (state.pinnedAgentIdsByWorkspace[persistenceKey] ?? EMPTY_PINNED_AGENT_IDS)
      : EMPTY_PINNED_AGENT_IDS,
  );
  const _hiddenAgentIds = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.hiddenAgentIdsByWorkspace[persistenceKey] ?? EMPTY_SET) : EMPTY_SET,
  );
  const pendingByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const { closingTabIds, closeTab } = useCloseTabs();
  const { onLayout: onHeaderLayout, isBelow: showCompactButtonLabels } =
    useContainerWidthBelow(700);
  const closeWorkspaceTabWithCleanup = useCallback(
    function closeWorkspaceTabWithCleanup(input: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      const normalizedTabId = trimNonEmpty(input.tabId);
      if (!normalizedTabId || !persistenceKey) {
        return;
      }

      if (input.target?.kind === "agent") {
        unpinWorkspaceAgent(persistenceKey, input.target.agentId);
        hideWorkspaceAgent(persistenceKey, input.target.agentId);
      }
      if (input.target?.kind === "browser") {
        const { browserId } = input.target;
        useBrowserStore.getState().removeBrowser(browserId);
        void getDesktopHost()?.browser?.clearPartition?.(browserId);
      }
      closeWorkspaceTab(persistenceKey, normalizedTabId);
    },
    [closeWorkspaceTab, hideWorkspaceAgent, persistenceKey, unpinWorkspaceAgent],
  );

  const focusedPaneTabState = useMemo(
    () =>
      deriveWorkspacePaneState({
        layout: workspaceLayout,
        tabs: uiTabs,
      }),
    [uiTabs, workspaceLayout],
  );
  const setFocusedAgentId = useSessionStore((state) => state.setFocusedAgentId);
  const setFocusedTerminalId = useSessionStore((state) => state.setFocusedTerminalId);
  const focusedPaneAgentId = useMemo(() => {
    const target = focusedPaneTabState.activeTab?.descriptor.target;
    if (target?.kind !== "agent") {
      return null;
    }
    return target.agentId;
  }, [focusedPaneTabState.activeTab]);
  const focusedPaneTerminalId = useMemo(() => {
    const target = focusedPaneTabState.activeTab?.descriptor.target;
    if (target?.kind !== "terminal") {
      return null;
    }
    return target.terminalId;
  }, [focusedPaneTabState.activeTab]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    setFocusedAgentId(normalizedServerId, focusedPaneAgentId);
    setFocusedTerminalId(normalizedServerId, focusedPaneTerminalId);
  }, [
    focusedPaneAgentId,
    focusedPaneTerminalId,
    isRouteFocused,
    normalizedServerId,
    setFocusedAgentId,
    setFocusedTerminalId,
  ]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    return () => {
      setFocusedAgentId(normalizedServerId, null);
      setFocusedTerminalId(normalizedServerId, null);
    };
  }, [isRouteFocused, normalizedServerId, setFocusedAgentId, setFocusedTerminalId]);

  const openWorkspaceDraftTab = useCallback(
    function openWorkspaceDraftTab(input?: { draftId?: string; focus?: boolean }) {
      if (!persistenceKey) {
        return null;
      }

      const target = normalizeWorkspaceTabTarget({
        kind: "draft",
        draftId: trimNonEmpty(input?.draftId) ?? generateDraftId(),
      });
      invariant(target?.kind === "draft", "Draft tab target must be valid");
      if (input?.focus === false) {
        return openWorkspaceTabInBackground(persistenceKey, target);
      }
      return openWorkspaceTabFocused(persistenceKey, target);
    },
    [openWorkspaceTabFocused, openWorkspaceTabInBackground, persistenceKey],
  );

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    if (!normalizedServerId || !normalizedWorkspaceId || !persistenceKey) {
      return;
    }
    if (!hasHydratedWorkspaceLayoutStore) {
      return;
    }

    const hasActivePendingDraftCreateInWorkspace = uiTabs.some((tab) => {
      if (tab.target.kind !== "draft") {
        return false;
      }
      const pending = pendingByDraftId[tab.target.draftId];
      return pending?.serverId === normalizedServerId && pending.lifecycle === "active";
    });

    reconcileWorkspaceTabs(
      persistenceKey,
      buildWorkspaceTabSnapshot({
        agentVisibility: workspaceAgentVisibility,
        agentsHydrated: hasHydratedAgents,
        terminalsHydrated: terminalsQuery.isSuccess,
        knownTerminalIds,
        standaloneTerminalIds,
        hasActivePendingDraftCreate: hasActivePendingDraftCreateInWorkspace,
      }),
    );
  }, [
    hasHydratedAgents,
    hasHydratedWorkspaceLayoutStore,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
    pendingByDraftId,
    persistenceKey,
    reconcileWorkspaceTabs,
    knownTerminalIds,
    standaloneTerminalIds,
    terminalsQuery.isSuccess,
    uiTabs,
    workspaceAgentVisibility,
  ]);

  const activeTabId = focusedPaneTabState.activeTabId;
  const activeTab = focusedPaneTabState.activeTab;

  const tabs = useMemo<WorkspaceTabDescriptor[]>(
    () => focusedPaneTabState.tabs.map((tab) => tab.descriptor),
    [focusedPaneTabState.tabs],
  );
  const hasSetupTab = useMemo(
    () =>
      uiTabs.some(
        (tab) => tab.target.kind === "setup" && tab.target.workspaceId === normalizedWorkspaceId,
      ),
    [normalizedWorkspaceId, uiTabs],
  );

  const navigateToTabId = useCallback(
    function navigateToTabId(tabId: string) {
      if (!tabId || !persistenceKey) {
        return;
      }
      focusWorkspaceTab(persistenceKey, tabId);
    },
    [focusWorkspaceTab, persistenceKey],
  );
  const handleImportedAgent = useCallback(
    (agentId: string) => {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, { kind: "agent", agentId });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, openWorkspaceTabFocused, persistenceKey],
  );

  const emptyWorkspaceSeedRef = useRef<string | null>(null);
  const autoOpenedSetupTabWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRouteFocused || !client || !normalizedServerId || !normalizedWorkspaceId) {
      return;
    }
    ensureWorkspaceSetupStatus({
      serverId: normalizedServerId,
      workspaceId: normalizedWorkspaceId,
      client,
    });
  }, [
    client,
    ensureWorkspaceSetupStatus,
    isRouteFocused,
    normalizedServerId,
    normalizedWorkspaceId,
  ]);

  useEffect(() => {
    if (
      !shouldSeedEmptyWorkspaceDraft({
        isRouteFocused,
        hasPersistenceKey: Boolean(persistenceKey),
        hasWorkspaceDirectory: Boolean(workspaceDirectory),
        hasHydratedWorkspaceLayoutStore,
        hasHydratedAgents,
        hasLoadedTerminals: terminalsQuery.isSuccess,
        activeAgentCount: workspaceAgentVisibility.activeAgentIds.size,
        terminalCount: terminals.length,
        tabCount: tabs.length,
      })
    ) {
      emptyWorkspaceSeedRef.current = null;
      return;
    }
    const workspaceKey = `${normalizedServerId}:${normalizedWorkspaceId}`;
    if (emptyWorkspaceSeedRef.current === workspaceKey) {
      return;
    }
    emptyWorkspaceSeedRef.current = workspaceKey;
    openWorkspaceDraftTab();
  }, [
    normalizedServerId,
    normalizedWorkspaceId,
    openWorkspaceDraftTab,
    persistenceKey,
    hasHydratedAgents,
    hasHydratedWorkspaceLayoutStore,
    isRouteFocused,
    terminals.length,
    terminalsQuery.isSuccess,
    tabs.length,
    workspaceDirectory,
    workspaceAgentVisibility.activeAgentIds.size,
  ]);

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }
    if (!persistenceKey) {
      return;
    }
    if (!workspaceSetupSnapshot || !showWorkspaceSetup) {
      if (autoOpenedSetupTabWorkspaceRef.current === persistenceKey) {
        autoOpenedSetupTabWorkspaceRef.current = null;
      }
      return;
    }

    const snapshotAge = Date.now() - workspaceSetupSnapshot.updatedAt;
    const shouldAutoOpen =
      workspaceSetupSnapshot.status === "running" ||
      snapshotAge <= WORKSPACE_SETUP_AUTO_OPEN_WINDOW_MS;
    if (!shouldAutoOpen) {
      return;
    }
    if (hasSetupTab) {
      autoOpenedSetupTabWorkspaceRef.current = persistenceKey;
      return;
    }
    if (autoOpenedSetupTabWorkspaceRef.current === persistenceKey) {
      return;
    }

    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: normalizedWorkspaceId,
    });
    if (!target) {
      return;
    }

    const tabId = openWorkspaceTabInBackground(persistenceKey, target);
    if (!tabId) {
      return;
    }

    autoOpenedSetupTabWorkspaceRef.current = persistenceKey;
  }, [
    hasSetupTab,
    isRouteFocused,
    normalizedWorkspaceId,
    openWorkspaceTabInBackground,
    persistenceKey,
    showWorkspaceSetup,
    workspaceSetupSnapshot,
  ]);

  const handleOpenFileFromChat = useCallback(
    (location: WorkspaceFileLocation, options?: { parentTabId?: string | null }) => {
      const normalizedLocation = normalizeWorkspaceFileLocation(location);
      if (!normalizedLocation) {
        return;
      }
      if (isMobile) {
        showMobileAgent();
      }
      if (!persistenceKey) {
        return;
      }
      const target = createWorkspaceFileTabTarget(normalizedLocation);
      const tabId = options?.parentTabId
        ? openWorkspaceChildTabFocused(persistenceKey, target, options.parentTabId)
        : openWorkspaceTabFocused(persistenceKey, target);
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [
      isMobile,
      navigateToTabId,
      openWorkspaceChildTabFocused,
      openWorkspaceTabFocused,
      persistenceKey,
      showMobileAgent,
    ],
  );

  const handleOpenFileFromChatInSidePane = useCallback(
    (input: {
      location: WorkspaceFileLocation;
      sourcePaneId?: string;
      parentTabId?: string | null;
    }) => {
      // Files route to the right tool panel by surface, so opening "in a side
      // pane" is just a normal file open — the tool panel is the side surface.
      handleOpenFileFromChat(input.location, { parentTabId: input.parentTabId });
    },
    [handleOpenFileFromChat],
  );

  const handleOpenWorkspaceFileFromPane = useStableEvent(function handleOpenWorkspaceFileFromPane({
    request,
    paneId,
    parentTabId,
    focusPaneBeforeOpen,
  }: {
    request: WorkspaceFileOpenRequest;
    paneId?: string | null;
    parentTabId: string;
    focusPaneBeforeOpen?: boolean;
  }) {
    if (focusPaneBeforeOpen && paneId && persistenceKey) {
      focusWorkspacePane(persistenceKey, paneId);
    }
    if (request.disposition === "side") {
      handleOpenFileFromChatInSidePane({
        location: request.location,
        sourcePaneId: paneId ?? undefined,
        parentTabId,
      });
      return;
    }
    handleOpenFileFromChat(request.location, { parentTabId });
  });

  const [hoveredCloseTabKey, setHoveredCloseTabKey] = useState<string | null>(null);
  const { handleRenameTab, renamingTab, handleRenameModalSubmit, handleRenameModalClose } =
    useWorkspaceTabRename({
      client,
      normalizedServerId,
      queryClient,
      terminalsData: terminalsQuery.data,
      terminalsQueryKey,
    });

  const tabByKey = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of tabs) {
      map.set(tab.key, tab);
    }
    return map;
  }, [tabs]);

  const allTabDescriptorsById = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor>();
    for (const tab of uiTabs) {
      map.set(tab.tabId, {
        key: tab.tabId,
        tabId: tab.tabId,
        kind: tab.target.kind,
        target: tab.target,
      });
    }
    return map;
  }, [uiTabs]);
  const bulkCloseConfirmationLabels = useMemo<BulkCloseConfirmationLabels>(
    () => ({
      all: ({ agents, terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.all", {
          agents,
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTerminals: ({ agents, terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTerminals", {
          agents,
          terminals: terminalCount,
        }),
      terminalsAndTabs: ({ terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.terminalsAndTabs", {
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTabs: ({ agents, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTabs", { agents, tabs: tabCount }),
      terminals: ({ terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.terminals", { terminals: terminalCount }),
      tabs: ({ tabs: tabCount }) => t("workspace.tabs.confirmations.bulk.tabs", { tabs: tabCount }),
      agents: ({ agents }) => t("workspace.tabs.confirmations.bulk.agents", { agents }),
    }),
    [t],
  );
  const activeTabKey = useMemo(() => activeTabId ?? "", [activeTabId]);
  const tabFallbackLabels = useMemo(
    () => ({
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      workspaceSetup: t("workspace.tabs.fallback.workspaceSetup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      browser: t("workspace.tabs.fallback.browser"),
      agent: t("workspace.tabs.fallback.agent"),
      review: t("workspace.tabs.toolsMenu.review"),
      files: t("workspace.tabs.toolsMenu.file"),
    }),
    [t],
  );

  const tabSwitcherOptions = useMemo(
    () =>
      tabs.map((tab) => ({
        id: tab.key,
        label: getFallbackTabOptionLabel(tab, tabFallbackLabels),
        description: getFallbackTabOptionDescription(tab, tabFallbackLabels),
      })),
    [tabFallbackLabels, tabs],
  );

  const handleCreateDraftTab = useCallback(
    (input?: { paneId?: string }) => {
      if (input?.paneId && persistenceKey) {
        focusWorkspacePane(persistenceKey, input.paneId);
      }
      openWorkspaceDraftTab();
    },
    [focusWorkspacePane, openWorkspaceDraftTab, persistenceKey],
  );

  const handleCreateTerminal = useStableEvent(createTerminal);

  const handleCreateTerminalWithProfile = useCallback(
    (profile: TerminalProfileInput) => {
      createTerminal({ profile });
    },
    [createTerminal],
  );

  const handleCreateBrowserTab = useCallback(
    (input?: { paneId?: string }) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      if (input?.paneId) {
        focusWorkspacePane(persistenceKey, input.paneId);
      }
      const { browserId } = createWorkspaceBrowser();
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [focusWorkspacePane, openWorkspaceTabFocused, persistenceKey],
  );

  const handleOpenSideChatTab = useCallback(
    function handleOpenSideChatTab() {
      if (!persistenceKey) {
        return;
      }
      const target = normalizeWorkspaceTabTarget({ kind: "draft", draftId: generateDraftId() });
      invariant(target?.kind === "draft", "Side chat draft target must be valid");
      const tabId = openWorkspaceTabFocused(persistenceKey, target, "right");
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, openWorkspaceTabFocused, persistenceKey],
  );

  const handleOpenReviewTool = useCallback(
    function handleOpenReviewTool() {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, {
        kind: "review",
        workspaceId: normalizedWorkspaceId,
      });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, normalizedWorkspaceId, openWorkspaceTabFocused, persistenceKey],
  );

  const handleOpenFileTool = useCallback(
    function handleOpenFileTool() {
      if (!persistenceKey) {
        return;
      }
      const tabId = openWorkspaceTabFocused(persistenceKey, {
        kind: "files",
        workspaceId: normalizedWorkspaceId,
      });
      if (tabId) {
        navigateToTabId(tabId);
      }
    },
    [navigateToTabId, normalizedWorkspaceId, openWorkspaceTabFocused, persistenceKey],
  );

  const rightPanelExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rightPanelExiting, setRightPanelExiting] = useState(false);
  useEffect(
    () => () => {
      if (rightPanelExitTimerRef.current) {
        clearTimeout(rightPanelExitTimerRef.current);
      }
    },
    [],
  );
  const handleCloseRightToolPanel = useCallback(
    function handleCloseRightToolPanel() {
      if (!persistenceKey) {
        return;
      }
      // Closing always exits the maximized state.
      setRightToolPanelMaximized(persistenceKey, false);
      // Keep the panel mounted briefly so it slides out, then remove it from the layout.
      if (rightPanelExitTimerRef.current) {
        clearTimeout(rightPanelExitTimerRef.current);
      }
      setRightPanelExiting(true);
      rightPanelExitTimerRef.current = setTimeout(() => {
        closeRightToolPanel(persistenceKey);
        setRightPanelExiting(false);
        rightPanelExitTimerRef.current = null;
      }, 180);
    },
    [closeRightToolPanel, persistenceKey, setRightToolPanelMaximized],
  );

  const handleToggleRightToolPanel = useCallback(
    function handleToggleRightToolPanel() {
      if (!persistenceKey) {
        return;
      }
      if (isRightToolPanelOpenForWorkspace) {
        handleCloseRightToolPanel();
        return;
      }
      openRightToolPanel(persistenceKey);
    },
    [
      handleCloseRightToolPanel,
      isRightToolPanelOpenForWorkspace,
      openRightToolPanel,
      persistenceKey,
    ],
  );

  const handleToggleRightToolPanelMaximized = useCallback(
    function handleToggleRightToolPanelMaximized() {
      if (!persistenceKey) {
        return;
      }
      const next = !isRightToolPanelMaximized;
      if (next) {
        // Maximizing implies the panel is open + uncollapsed.
        openRightToolPanel(persistenceKey);
      }
      setRightToolPanelMaximized(persistenceKey, next);
    },
    [isRightToolPanelMaximized, openRightToolPanel, persistenceKey, setRightToolPanelMaximized],
  );

  const handleOpenReviewFromChanges = useCallback(
    function handleOpenReviewFromChanges() {
      if (!persistenceKey) {
        return;
      }
      openWorkspaceTabInBackground(persistenceKey, {
        kind: "files",
        workspaceId: normalizedWorkspaceId,
      });
      const reviewTabId = openWorkspaceTabFocused(persistenceKey, {
        kind: "review",
        workspaceId: normalizedWorkspaceId,
      });
      if (reviewTabId) {
        navigateToTabId(reviewTabId);
      }
    },
    [
      navigateToTabId,
      normalizedWorkspaceId,
      openWorkspaceTabFocused,
      openWorkspaceTabInBackground,
      persistenceKey,
    ],
  );

  // Diff badge in the header: click toggles the right panel via review — open review (+ files) when
  // closed, collapse when already open (collapse keeps the tabs; see D).
  const handleToggleReviewFromChanges = useCallback(
    function handleToggleReviewFromChanges() {
      if (isRightToolPanelOpenForWorkspace) {
        handleCloseRightToolPanel();
        return;
      }
      handleOpenReviewFromChanges();
    },
    [handleCloseRightToolPanel, handleOpenReviewFromChanges, isRightToolPanelOpenForWorkspace],
  );

  const toolsAddHandlers = useMemo<WorkspaceToolsAddHandlers>(
    () => ({
      onCreateReview: handleOpenReviewTool,
      onCreateTerminal: handleCreateTerminal,
      onCreateBrowser: handleCreateBrowserTab,
      onCreateFile: handleOpenFileTool,
      onCreateSideChat: handleOpenSideChatTab,
    }),
    [
      handleCreateBrowserTab,
      handleCreateTerminal,
      handleOpenFileTool,
      handleOpenReviewTool,
      handleOpenSideChatTab,
    ],
  );

  const handleOpenUrlInBrowserTab = useCallback(
    (url: string) => {
      if (!persistenceKey || !getIsElectron()) {
        return;
      }
      const { browserId } = createWorkspaceBrowser({ initialUrl: url });
      openWorkspaceTabFocused(persistenceKey, { kind: "browser", browserId });
    },
    [openWorkspaceTabFocused, persistenceKey],
  );

  useDesktopBrowserNewTabRequests({
    enabled: Boolean(persistenceKey),
    workspaceLayout,
    openUrl: handleOpenUrlInBrowserTab,
  });

  const handleSelectSwitcherTab = useCallback(
    (key: string) => {
      navigateToTabId(key);
    },
    [navigateToTabId],
  );

  const handleCreateDraftSplit = useCallback(
    (input: { targetPaneId: string; position: "left" | "right" | "top" | "bottom" }) => {
      if (!persistenceKey) {
        return;
      }

      const paneId = splitWorkspacePaneEmpty(persistenceKey, input);
      if (!paneId) {
        return;
      }

      handleCreateDraftTab({ paneId });
    },
    [handleCreateDraftTab, persistenceKey, splitWorkspacePaneEmpty],
  );

  const killTerminalAsync = killTerminalMutation.mutateAsync;

  const handleCloseTerminalTab = useCallback(
    async (input: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = input;
      await closeTab(tabId, async () => {
        const confirmed = await confirmDialog({
          title: t("workspace.tabs.confirmations.closeTerminalTitle"),
          message: t("workspace.tabs.confirmations.closeTerminalMessage"),
          confirmLabel: t("workspace.tabs.confirmations.close"),
          cancelLabel: t("workspace.tabs.confirmations.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        removeTerminalFromCache(terminalId);
        setHoveredCloseTabKey((current) => (current === tabId ? null : current));
        if (persistenceKey) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: { kind: "terminal", terminalId },
          });
        }

        void killTerminalAsync(terminalId).catch(invalidateTerminals);
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      invalidateTerminals,
      killTerminalAsync,
      persistenceKey,
      removeTerminalFromCache,
      t,
    ],
  );

  const handleCloseAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await closeTab(tabId, async () => {
        if (!normalizedServerId) {
          return;
        }

        const agent =
          useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
        const closePolicy = resolveCloseAgentTabPolicy(agent);
        const isRunning = agent?.status === "running";

        if (isRunning && closePolicy.kind === "archive-on-close") {
          const confirmed = await confirmDialog({
            title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
            message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
            confirmLabel: t("workspace.tabs.confirmations.archive"),
            cancelLabel: t("workspace.tabs.confirmations.cancel"),
            destructive: true,
          });
          if (!confirmed) {
            return;
          }
        }

        setHoveredCloseTabKey((current) => (current === tabId ? null : current));
        if (persistenceKey) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: { kind: "agent", agentId },
          });
        }

        if (closePolicy.kind === "layout-only") {
          return;
        }

        // Errors (e.g. timeout) are handled by the mutation's onSettled callback
        void archiveAgent({ serverId: normalizedServerId, agentId }).catch(() => {});
      });
    },
    [archiveAgent, closeTab, closeWorkspaceTabWithCleanup, normalizedServerId, persistenceKey, t],
  );

  const handleCloseDraftOrFileTab = useCallback(
    function handleCloseDraftOrFileTab(input: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      setHoveredCloseTabKey((current) => (current === input.tabId ? null : current));
      if (persistenceKey) {
        closeWorkspaceTabWithCleanup({ tabId: input.tabId, target: input.target });
      }
    },
    [closeWorkspaceTabWithCleanup, persistenceKey],
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const tab = allTabDescriptorsById.get(tabId);
      if (!tab) {
        return;
      }
      if (tab.target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: tab.target.terminalId });
        return;
      }
      if (tab.target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: tab.target.agentId });
        return;
      }
      handleCloseDraftOrFileTab({ tabId, target: tab.target });
    },
    [allTabDescriptorsById, handleCloseAgentTab, handleCloseDraftOrFileTab, handleCloseTerminalTab],
  );

  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied(t("workspace.tabs.toasts.agentIdCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const handleCopyFilePath = useCallback(
    async (path: string) => {
      if (!path) return;
      try {
        await Clipboard.setStringAsync(path);
        toast.copied(t("workspace.tabs.toasts.filePathCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent =
        useSessionStore.getState().sessions[normalizedServerId]?.agents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error(t("workspace.tabs.toasts.resumeIdUnavailable"));
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied(t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [normalizedServerId, toast, t],
  );

  const handleReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }

      toast.show(t("workspace.tabs.toasts.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        // Send the existing cursor so the server detects the new epoch and
        // returns reset:true. Without a cursor, the server returns reset:false
        // and the client takes the incremental path, where new-epoch rows are
        // dropped against the stale cursor.
        const sessionState = useSessionStore.getState().sessions[normalizedServerId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await client.fetchAgentTimeline(agentId, {
          direction: "tail",
          projection: "projected",
          ...(currentCursor
            ? { cursor: { epoch: currentCursor.epoch, seq: currentCursor.endSeq } }
            : {}),
        });
        toast.show(t("workspace.tabs.toasts.reloadedAgent"), { variant: "success" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.tabs.toasts.failedToReloadAgent"),
        );
      }
    },
    [client, isConnected, normalizedServerId, toast, t],
  );

  const handleCopyWorkspacePath = useCallback(async () => {
    if (!workspaceDirectory) {
      toast.error(t("workspace.header.toasts.workspacePathUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(workspaceDirectory);
      toast.copied(t("workspace.header.toasts.workspacePathCopiedLabel"));
    } catch {
      toast.error(t("workspace.tabs.toasts.copyFailed"));
    }
  }, [toast, workspaceDirectory, t]);

  const handleCopyBranchName = useCallback(async () => {
    if (!currentBranchName) {
      toast.error(t("workspace.header.toasts.branchNameUnavailable"));
      return;
    }

    try {
      await Clipboard.setStringAsync(currentBranchName);
      toast.copied(t("workspace.header.toasts.branchNameCopiedLabel"));
    } catch {
      toast.error(t("workspace.tabs.toasts.copyFailed"));
    }
  }, [currentBranchName, toast, t]);

  const handleOpenSetupTab = useCallback(() => {
    if (!persistenceKey) {
      return;
    }
    const target = normalizeWorkspaceTabTarget({
      kind: "setup",
      workspaceId: normalizedWorkspaceId,
    });
    if (!target) {
      return;
    }
    openWorkspaceTabFocused(persistenceKey, target);
  }, [normalizedWorkspaceId, openWorkspaceTabFocused, persistenceKey]);

  const handleBulkCloseTabs = useCallback(
    async (input: { tabsToClose: WorkspaceTabDescriptor[]; title: string; logLabel: string }) => {
      const { tabsToClose, title, logLabel } = input;
      if (tabsToClose.length === 0) {
        return;
      }

      const groups = classifyBulkClosableTabs(tabsToClose);
      const confirmed = await confirmDialog({
        title,
        message: buildBulkCloseConfirmationMessage(groups, bulkCloseConfirmationLabels),
        confirmLabel: t("workspace.tabs.confirmations.close"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      await closeBulkWorkspaceTabs({
        client,
        groups,
        closeTab,
        closeWorkspaceTabWithCleanup: (cleanupInput) => {
          if (!persistenceKey) {
            return;
          }
          closeWorkspaceTabWithCleanup(cleanupInput);
        },
        logLabel,
        warn: (message, payload) => {
          console.warn(message, payload);
        },
      });

      const closedKeys = new Set(tabsToClose.map((tab) => tab.key));
      setHoveredCloseTabKey((current) => (current && closedKeys.has(current) ? null : current));
    },
    [
      bulkCloseConfirmationLabels,
      client,
      closeTab,
      closeWorkspaceTabWithCleanup,
      persistenceKey,
      t,
    ],
  );

  const handleCloseTabsToLeftInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(0, index),
        title: t("workspace.tabs.confirmations.closeTabsLeftTitle"),
        logLabel: "to the left",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToLeft = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToLeftInPane(tabId, tabs);
    },
    [handleCloseTabsToLeftInPane, tabs],
  );

  const handleCloseTabsToRightInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const index = paneTabs.findIndex((tab) => tab.tabId === tabId);
      if (index < 0) {
        return;
      }
      await handleBulkCloseTabs({
        tabsToClose: paneTabs.slice(index + 1),
        title: t("workspace.tabs.confirmations.closeTabsRightTitle"),
        logLabel: "to the right",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseTabsToRight = useCallback(
    async (tabId: string) => {
      await handleCloseTabsToRightInPane(tabId, tabs);
    },
    [handleCloseTabsToRightInPane, tabs],
  );

  const handleCloseOtherTabsInPane = useCallback(
    async (tabId: string, paneTabs: WorkspaceTabDescriptor[]) => {
      const tabsToClose = paneTabs.filter((tab) => tab.tabId !== tabId);
      await handleBulkCloseTabs({
        tabsToClose,
        title: t("workspace.tabs.confirmations.closeOtherTabsTitle"),
        logLabel: "from close other tabs",
      });
    },
    [handleBulkCloseTabs, t],
  );

  const handleCloseOtherTabs = useCallback(
    async (tabId: string) => {
      await handleCloseOtherTabsInPane(tabId, tabs);
    },
    [handleCloseOtherTabsInPane, tabs],
  );

  const simpleWorkspaceTabActions = useMemo<Partial<Record<KeyboardActionId, () => void>>>(
    () => ({
      "workspace.tab.new": handleCreateDraftTab,
      "workspace.terminal.new": handleCreateTerminal,
      "workspace.review.open": handleOpenReviewTool,
      "workspace.file.open": handleOpenFileTool,
      "workspace.side-chat.open": handleOpenSideChatTab,
      "workspace.tool-panel.toggle": handleToggleRightToolPanel,
    }),
    [
      handleCreateDraftTab,
      handleCreateTerminal,
      handleOpenFileTool,
      handleOpenReviewTool,
      handleOpenSideChatTab,
      handleToggleRightToolPanel,
    ],
  );

  const handleWorkspaceTabAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      const simpleHandler = simpleWorkspaceTabActions[action.id];
      if (simpleHandler) {
        simpleHandler();
        return true;
      }
      if (action.id === "workspace.tab.close-current") {
        if (activeTabId) {
          void handleCloseTabById(activeTabId);
        }
        return true;
      }
      if (action.id === "workspace.tab.navigate-index") {
        const nextTabId = tabs[action.index - 1]?.tabId;
        if (nextTabId) {
          navigateToTabId(nextTabId);
        }
        return true;
      }
      if (action.id === "workspace.tab.navigate-relative") {
        const nextTabId = resolveRelativeTabId(tabs, activeTabId, action.delta);
        if (nextTabId) {
          navigateToTabId(nextTabId);
        }
        return true;
      }
      return false;
    },
    [activeTabId, handleCloseTabById, navigateToTabId, simpleWorkspaceTabActions, tabs],
  );

  const handleWorkspaceSidebarAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (action.id !== "sidebar.toggle.right") {
        return false;
      }
      handleToggleRightToolPanel();
      return true;
    },
    [handleToggleRightToolPanel],
  );

  const handleWorkspacePaneAction = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      if (!persistenceKey || !workspaceLayout) {
        return true;
      }

      const focusedPane = focusedPaneTabState.pane;
      if (!focusedPane) {
        return true;
      }

      if (action.id === "workspace.pane.split.right") {
        handleCreateDraftSplit({
          targetPaneId: focusedPane.id,
          position: "right",
        });
        return true;
      }

      if (action.id === "workspace.pane.split.down") {
        handleCreateDraftSplit({
          targetPaneId: focusedPane.id,
          position: "bottom",
        });
        return true;
      }

      if (action.id.startsWith("workspace.pane.focus.")) {
        const direction = parsePaneDirection(action.id);
        if (direction) {
          const adjacentPaneId = findAdjacentPane(workspaceLayout.root, focusedPane.id, direction);
          if (adjacentPaneId) {
            focusWorkspacePane(persistenceKey, adjacentPaneId);
          }
        }
        return true;
      }

      if (action.id.startsWith("workspace.pane.move-tab.")) {
        const direction = parsePaneDirection(action.id);
        if (direction) {
          const activePaneTabId = focusedPaneTabState.activeTabId;
          const adjacentPaneId = findAdjacentPane(workspaceLayout.root, focusedPane.id, direction);
          if (activePaneTabId && adjacentPaneId) {
            paneFocusSuppressedRef.current = true;
            moveWorkspaceTabToPane(persistenceKey, activePaneTabId, adjacentPaneId);
            requestAnimationFrame(() => {
              paneFocusSuppressedRef.current = false;
            });
          }
        }
        return true;
      }

      if (action.id === "workspace.pane.close") {
        for (const tabId of focusedPane.tabIds) {
          closeWorkspaceTabWithCleanup({
            tabId,
            target: allTabDescriptorsById.get(tabId)?.target ?? null,
          });
        }
        return true;
      }

      return false;
    },
    [
      allTabDescriptorsById,
      closeWorkspaceTabWithCleanup,
      focusWorkspacePane,
      handleCreateDraftSplit,
      moveWorkspaceTabToPane,
      persistenceKey,
      focusedPaneTabState.activeTabId,
      focusedPaneTabState.pane,
      workspaceLayout,
    ],
  );

  useKeyboardActionHandler({
    handlerId: `workspace-tab-actions:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: [
      "workspace.tab.new",
      "workspace.tab.close-current",
      "workspace.tab.navigate-index",
      "workspace.tab.navigate-relative",
      "workspace.terminal.new",
      "workspace.review.open",
      "workspace.file.open",
      "workspace.side-chat.open",
      "workspace.tool-panel.toggle",
    ] as const,
    enabled: Boolean(isRouteFocused && normalizedServerId && normalizedWorkspaceId),
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceTabAction,
  });

  useKeyboardActionHandler({
    handlerId: `workspace-pane-actions:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: [
      "workspace.pane.split.right",
      "workspace.pane.split.down",
      "workspace.pane.focus.left",
      "workspace.pane.focus.right",
      "workspace.pane.focus.up",
      "workspace.pane.focus.down",
      "workspace.pane.move-tab.left",
      "workspace.pane.move-tab.right",
      "workspace.pane.move-tab.up",
      "workspace.pane.move-tab.down",
      "workspace.pane.close",
    ] as const,
    enabled: Boolean(isRouteFocused && normalizedServerId && normalizedWorkspaceId),
    priority: 100,
    isActive: () => true,
    handle: handleWorkspacePaneAction,
  });

  useKeyboardActionHandler({
    handlerId: `workspace-sidebar-actions:${normalizedServerId}:${normalizedWorkspaceId}`,
    actions: ["sidebar.toggle.right"] as const,
    enabled: Boolean(isRouteFocused && normalizedServerId && normalizedWorkspaceId),
    priority: 100,
    isActive: () => true,
    handle: handleWorkspaceSidebarAction,
  });

  const activeTabDescriptor = useMemo(() => activeTab?.descriptor ?? null, [activeTab]);
  const activeFileFields = getWorkspaceFileLocationFields(activeTabDescriptor);
  const activeFilePath = activeFileFields.path;
  const activeFileLineStart = activeFileFields.lineStart;
  const activeFileLineEnd = activeFileFields.lineEnd;
  const activeFileLocation = useMemo<WorkspaceFileLocation | null>(
    () =>
      buildWorkspaceFileLocation({
        path: activeFilePath,
        lineStart: activeFileLineStart,
        lineEnd: activeFileLineEnd,
      }),
    [activeFileLineEnd, activeFileLineStart, activeFilePath],
  );
  const canRenderDesktopPaneSplits = supportsDesktopPaneSplits();
  const shouldRenderDesktopPaneFallback = useMemo(
    () => !isMobile && !canRenderDesktopPaneSplits,
    [isMobile, canRenderDesktopPaneSplits],
  );
  useEffect(() => {
    if (!isRouteFocused || isNative || typeof document === "undefined" || activeTabDescriptor) {
      return;
    }
    document.title = "Workspace";
  }, [activeTabDescriptor, isRouteFocused]);
  const buildPaneContentModel = useCallback(
    (input: {
      tab: WorkspaceTabDescriptor;
      paneId?: string | null;
      focusPaneBeforeOpen?: boolean;
    }) =>
      buildWorkspacePaneContentModel({
        tab: input.tab,
        normalizedServerId,
        normalizedWorkspaceId,
        onOpenTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          if (input.focusPaneBeforeOpen && input.paneId) {
            focusWorkspacePane(persistenceKey, input.paneId);
          }
          const tabId = openWorkspaceChildTabFocused(persistenceKey, target, input.tab.tabId);
          if (tabId) {
            navigateToTabId(tabId);
          }
        },
        onCloseCurrentTab: () => {
          void handleCloseTabById(input.tab.tabId);
        },
        onRetargetCurrentTab: (target) => {
          if (!persistenceKey) {
            return;
          }
          retargetWorkspaceTab(persistenceKey, input.tab.tabId, target);
        },
        onOpenWorkspaceFile: (request: WorkspaceFileOpenRequest) => {
          handleOpenWorkspaceFileFromPane({
            request,
            paneId: input.paneId,
            parentTabId: input.tab.tabId,
            focusPaneBeforeOpen: input.focusPaneBeforeOpen,
          });
        },
        onOpenImportSheet: openImportSheet,
      }),
    [
      handleCloseTabById,
      focusWorkspacePane,
      handleOpenWorkspaceFileFromPane,
      navigateToTabId,
      normalizedServerId,
      normalizedWorkspaceId,
      openImportSheet,
      openWorkspaceChildTabFocused,
      persistenceKey,
      retargetWorkspaceTab,
    ],
  );
  const focusedPaneId = useMemo(
    () => focusedPaneTabState.pane?.id ?? null,
    [focusedPaneTabState.pane],
  );
  const focusedPaneTabIds = useMemo(() => tabs.map((tab) => tab.tabId), [tabs]);
  const focusedPaneTabDescriptorMap = useStableTabDescriptorMap(tabs);
  const { mountedTabIds: mountedFocusedPaneTabIdsSet } = useMountedTabSet({
    activeTabId,
    allTabIds: focusedPaneTabIds,
    cap: 3,
  });
  const mountedFocusedPaneTabIds = useMemo(
    () => focusedPaneTabIds.filter((tabId) => mountedFocusedPaneTabIdsSet.has(tabId)),
    [focusedPaneTabIds, mountedFocusedPaneTabIdsSet],
  );
  const buildMobilePaneContentModel = useCallback(
    function buildMobilePaneContentModel(input: {
      paneId: string | null;
      tab: WorkspaceTabDescriptor;
    }) {
      return buildPaneContentModel({
        tab: input.tab,
        paneId: input.paneId,
        focusPaneBeforeOpen: false,
      });
    },
    [buildPaneContentModel],
  );
  const content = renderWorkspaceContent({
    isMissingWorkspaceDirectory,
    activeTabDescriptor,
    hasHydratedAgents,
    mountedFocusedPaneTabIds,
    focusedPaneTabDescriptorMap,
    isRouteFocused,
    focusedPaneId,
    buildMobilePaneContentModel,
  });

  const buildDesktopPaneContentModel = useCallback(
    function buildDesktopPaneContentModel(input: { paneId: string; tab: WorkspaceTabDescriptor }) {
      return buildPaneContentModel({
        tab: input.tab,
        paneId: input.paneId,
        focusPaneBeforeOpen: true,
      });
    },
    [buildPaneContentModel],
  );

  // When the right tool panel is maximized the SplitContainer renders only the tool (the
  // MAIN pane is dropped from the render layout). We re-mount the MAIN conversation's
  // composer on its own at the bottom of the canvas — same agent, same draft, same send
  // path — so "the dialog can still chat" (Image #2). Composer-only mode is signalled via
  // ComposerDockProvider. Drafts have a full setup UI rather than a bare composer, so we
  // only dock real agent conversations for now.
  const maximizedComposerDock = useMemo(() => {
    if (!isRightToolPanelMaximized || !workspaceLayout || !persistenceKey) {
      return null;
    }
    const mainPaneState = deriveWorkspacePaneState({
      layout: workspaceLayout,
      paneId: MAIN_PANE_ID,
      tabs: uiTabs,
    });
    const activeMainTab = mainPaneState.activeTab?.descriptor ?? null;
    if (!activeMainTab || activeMainTab.target.kind !== "agent") {
      return null;
    }
    const model = buildDesktopPaneContentModel({ paneId: MAIN_PANE_ID, tab: activeMainTab });
    return (
      <View style={styles.maximizedComposerDock}>
        <ComposerDockProvider value={true}>
          <WorkspacePaneContent content={model} isWorkspaceFocused={isRouteFocused} isPaneFocused />
        </ComposerDockProvider>
      </View>
    );
  }, [
    isRightToolPanelMaximized,
    workspaceLayout,
    persistenceKey,
    uiTabs,
    buildDesktopPaneContentModel,
    isRouteFocused,
  ]);

  const desktopTabRowItems = useMemo<WorkspaceDesktopTabRowItem[]>(
    () =>
      tabs.map((tab) => ({
        tab,
        isActive: tab.tabId === activeTabDescriptor?.tabId,
        isCloseHovered: hoveredCloseTabKey === tab.key,
        isClosingTab: closingTabIds.has(tab.tabId),
      })),
    [activeTabDescriptor?.tabId, closingTabIds, hoveredCloseTabKey, tabs],
  );

  const handleFocusPane = useStableEvent(function handleFocusPane(paneId: string) {
    if (!persistenceKey || paneFocusSuppressedRef.current) {
      return;
    }
    focusWorkspacePane(persistenceKey, paneId);
  });

  const handleSplitPane = useCallback(
    function handleSplitPane(input: {
      tabId: string;
      targetPaneId: string;
      position: "left" | "right" | "top" | "bottom";
    }) {
      if (!persistenceKey) {
        return;
      }
      splitWorkspacePane(persistenceKey, input);
    },
    [persistenceKey, splitWorkspacePane],
  );

  const handleMoveTabToPane = useCallback(
    function handleMoveTabToPane(tabId: string, toPaneId: string) {
      if (!persistenceKey) {
        return;
      }
      moveWorkspaceTabToPane(persistenceKey, tabId, toPaneId);
    },
    [moveWorkspaceTabToPane, persistenceKey],
  );

  const handleResizePaneSplit = useCallback(
    function handleResizePaneSplit(groupId: string, sizes: number[]) {
      if (!persistenceKey) {
        return;
      }
      resizeWorkspaceSplit(persistenceKey, groupId, sizes);
    },
    [persistenceKey, resizeWorkspaceSplit],
  );

  const handleReorderTabsInPane = useCallback(
    function handleReorderTabsInPane(paneId: string, tabIds: string[]) {
      if (!persistenceKey) {
        return;
      }
      reorderWorkspaceTabsInPane(persistenceKey, paneId, tabIds);
    },
    [persistenceKey, reorderWorkspaceTabsInPane],
  );

  const handleReorderTabsInFocusedPane = useCallback(
    (nextTabs: WorkspaceTabDescriptor[]) => {
      if (!focusedPaneId) {
        return;
      }
      handleReorderTabsInPane(
        focusedPaneId,
        nextTabs.map((tab) => tab.tabId),
      );
    },
    [focusedPaneId, handleReorderTabsInPane],
  );

  const renderSplitPaneEmptyState = useCallback(
    function renderSplitPaneEmptyState(paneId: string) {
      if (paneId === RIGHT_PANEL_PANE_ID) {
        return (
          <WorkspaceToolPicker
            handlers={toolsAddHandlers}
            showCreateBrowserTab={showCreateBrowserTab}
          />
        );
      }
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{t("workspace.tabs.emptyPane")}</Text>
        </View>
      );
    },
    [showCreateBrowserTab, t, toolsAddHandlers],
  );

  const renderSplitPaneTabBarTrailing = useCallback(
    function renderSplitPaneTabBarTrailing(paneId: string) {
      if (paneId === RIGHT_PANEL_PANE_ID) {
        return (
          <>
            <WorkspaceMaximizeToggle
              isMaximized={isRightToolPanelMaximized}
              onToggle={handleToggleRightToolPanelMaximized}
            />
            <WorkspaceToolPanelToggle isOpen onToggle={handleToggleRightToolPanel} />
          </>
        );
      }
      return null;
    },
    [handleToggleRightToolPanel, handleToggleRightToolPanelMaximized, isRightToolPanelMaximized],
  );

  const containerStyle = containerWithWorkspaceBackgroundStyle;

  const menuNewAgentIcon = MENU_NEW_AGENT_ICON;
  const menuNewTerminalIcon = MENU_NEW_TERMINAL_ICON;
  const menuCopyIcon = MENU_COPY_ICON;
  const menuSettingsIcon = MENU_SETTINGS_ICON;
  const workspaceScreenGate = renderWorkspaceRouteGate({
    state: workspaceRouteState,
    actions: {
      onRetryHost: handleRetryHost,
      onManageHost: handleManageHost,
      onDismissMissingWorkspace: handleDismissMissingWorkspace,
    },
  });
  const gatedWorkspaceScreen = renderWorkspaceScreenGateShell({
    gate: workspaceScreenGate,
    workspaceKey: persistenceKey,
  });

  const headerRight = useMemo(
    () => (
      <View style={styles.headerRight}>
        {SHOW_WORKSPACE_SCRIPTS_BUTTON &&
        !isMobile &&
        workspaceDescriptor &&
        workspaceDescriptor.scripts.length > 0 ? (
          <WorkspaceScriptsButton
            serverId={normalizedServerId}
            workspaceId={normalizedWorkspaceId}
            scripts={workspaceDescriptor.scripts}
            liveTerminalIds={liveTerminalIds}
            onScriptTerminalStarted={handleScriptTerminalStarted}
            onViewTerminal={handleViewScriptTerminal}
            onOpenUrlInBrowserTab={handleOpenUrlInBrowserTab}
            hideLabels
          />
        ) : null}
        {!isMobile && workspaceDirectory ? (
          <WorkspaceOpenInEditorButton
            serverId={normalizedServerId}
            cwd={workspaceDirectory}
            activeFile={activeFileLocation}
            hideLabels
          />
        ) : null}
        {!isMobile && isGitCheckout ? (
          <>
            {workspaceDirectory ? (
              <WorkspaceGitActions
                serverId={normalizedServerId}
                cwd={workspaceDirectory}
                hideLabels={showCompactButtonLabels}
              />
            ) : null}
            <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
              <TooltipTrigger asChild>
                <Pressable
                  testID="workspace-explorer-toggle"
                  onPress={handleToggleReviewFromChanges}
                  accessibilityRole="button"
                  accessibilityLabel={t("workspace.header.actions.review")}
                  style={reviewToggleStyle}
                >
                  {({ hovered, pressed }) => {
                    const active = hovered || pressed;
                    const colorMapping = active ? foregroundColorMapping : mutedColorMapping;
                    return (
                      <>
                        <ThemedSourceControlPanelIcon size={16} uniProps={colorMapping} />
                        {workspaceDescriptor?.diffStat ? (
                          <DiffStat
                            additions={workspaceDescriptor.diffStat.additions}
                            deletions={workspaceDescriptor.diffStat.deletions}
                          />
                        ) : null}
                      </>
                    );
                  }}
                </Pressable>
              </TooltipTrigger>
              <TooltipContent
                testID="workspace-explorer-toggle-tooltip"
                side="left"
                align="center"
                offset={8}
              >
                <View style={styles.explorerTooltipRow}>
                  <Text style={styles.explorerTooltipText}>
                    {t("workspace.header.actions.review")}
                  </Text>
                  <Shortcut keys={REVIEW_TOGGLE_KEYS} style={styles.explorerTooltipShortcut} />
                </View>
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
        {!isMobile && supportsDesktopPaneSplits() && !isRightToolPanelOpenForWorkspace ? (
          <WorkspaceToolPanelToggle isOpen={false} onToggle={handleToggleRightToolPanel} />
        ) : null}
        {isMobile ? (
          <HeaderToggleButton
            testID="workspace-explorer-toggle"
            onPress={isGitCheckout ? handleOpenReviewFromChanges : handleOpenFileTool}
            tooltipLabel={
              isGitCheckout
                ? t("workspace.header.actions.review")
                : t("workspace.header.actions.newFile")
            }
            tooltipKeys={REVIEW_TOGGLE_KEYS}
            tooltipSide="left"
            style={styles.headerActionButton}
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              isGitCheckout
                ? t("workspace.header.actions.review")
                : t("workspace.header.actions.newFile")
            }
          >
            {({ hovered }) => {
              const colorMapping = hovered ? foregroundColorMapping : mutedColorMapping;
              return isGitCheckout ? (
                <ThemedSourceControlPanelIcon
                  size={20}
                  uniProps={colorMapping}
                  {...sourceControlPanelStrokeWidth15}
                />
              ) : (
                <ThemedPanelRight size={20} uniProps={colorMapping} />
              );
            }}
          </HeaderToggleButton>
        ) : null}
      </View>
    ),
    [
      isMobile,
      workspaceDescriptor,
      normalizedServerId,
      normalizedWorkspaceId,
      workspaceDirectory,
      activeFileLocation,
      liveTerminalIds,
      handleScriptTerminalStarted,
      handleViewScriptTerminal,
      handleOpenUrlInBrowserTab,
      showCompactButtonLabels,
      isGitCheckout,
      reviewToggleStyle,
      handleOpenFileTool,
      handleOpenReviewFromChanges,
      isRightToolPanelOpenForWorkspace,
      handleToggleRightToolPanel,
      handleToggleReviewFromChanges,
      t,
    ],
  );

  const showScreenHeader = useMemo(
    // The desktop workspace header moved into the unified top bar (home shell); only
    // the mobile shell still renders its own in-pane header.
    () => isMobile && shouldShowWorkspaceScreenHeader({ isFocusModeEnabled, isMobile }),
    [isFocusModeEnabled, isMobile],
  );
  const createTerminalDisabled = useMemo(
    () => createTerminalMutation.isPending || pendingTerminalCreateInput !== null,
    [createTerminalMutation.isPending, pendingTerminalCreateInput],
  );
  const focusedPaneIdOrUndefined = useMemo(() => focusedPaneId ?? undefined, [focusedPaneId]);
  const desktopFocusModeEnabled = useMemo(
    () => isFocusModeEnabled && !isMobile,
    [isFocusModeEnabled, isMobile],
  );
  const workspaceFloatingPanelPortalHostName = useMemo(
    () =>
      `${WORKSPACE_FLOATING_PANEL_PORTAL_HOST_PREFIX}:${normalizedServerId}:${normalizedWorkspaceId}`,
    [normalizedServerId, normalizedWorkspaceId],
  );
  // Unified top bar: the workspace header is rendered as the MAIN pane's header (inside the
  // split) so it tracks the pane width/resize. Memoized so SplitContainer stays stable.
  const headerLeft = useMemo(
    () => (
      <>
        <SidebarMenuToggle />
        <WorkspaceHeaderTitleBar
          isLoading={isWorkspaceHeaderLoading}
          title={workspaceHeaderTitle}
          subtitle={workspaceHeaderSubtitle}
          showSubtitle={shouldShowWorkspaceHeaderSubtitle}
          currentBranchName={currentBranchName}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          workspaceScripts={workspaceScripts}
          liveTerminalIds={liveTerminalIds}
          showWorkspaceSetup={showWorkspaceSetup}
          showCreateBrowserTab={showCreateBrowserTab}
          showReviewAction={isGitCheckout}
          isMobile={isMobile}
          createTerminalDisabled={createTerminalDisabled}
          importAgentDisabled={!canOpenImportSheet}
          copyPathDisabled={!workspaceDirectory}
          menuNewAgentIcon={menuNewAgentIcon}
          menuNewTerminalIcon={menuNewTerminalIcon}
          menuNewBrowserIcon={MENU_NEW_BROWSER_ICON}
          menuReviewIcon={MENU_REVIEW_ICON}
          menuFileIcon={MENU_FILE_ICON}
          menuSideChatIcon={MENU_SIDE_CHAT_ICON}
          menuImportIcon={MENU_IMPORT_ICON}
          menuCopyIcon={menuCopyIcon}
          menuSettingsIcon={menuSettingsIcon}
          onCreateDraftTab={handleCreateDraftTab}
          onCreateTerminal={handleCreateTerminal}
          onCreateTerminalWithProfile={handleCreateTerminalWithProfile}
          onCreateBrowser={handleCreateBrowserTab}
          onOpenReview={handleOpenReviewTool}
          onOpenFile={handleOpenFileTool}
          onCreateSideChat={handleOpenSideChatTab}
          onOpenImportSheet={openImportSheet}
          onCopyWorkspacePath={handleCopyWorkspacePath}
          onCopyBranchName={handleCopyBranchName}
          onOpenSetupTab={handleOpenSetupTab}
          onScriptTerminalStarted={handleScriptTerminalStarted}
          onViewScriptTerminal={handleViewScriptTerminal}
          onOpenUrlInBrowserTab={handleOpenUrlInBrowserTab}
        />
      </>
    ),
    [
      isWorkspaceHeaderLoading,
      workspaceHeaderTitle,
      workspaceHeaderSubtitle,
      shouldShowWorkspaceHeaderSubtitle,
      currentBranchName,
      normalizedServerId,
      normalizedWorkspaceId,
      workspaceScripts,
      liveTerminalIds,
      showWorkspaceSetup,
      showCreateBrowserTab,
      isGitCheckout,
      isMobile,
      createTerminalDisabled,
      canOpenImportSheet,
      workspaceDirectory,
      menuNewAgentIcon,
      menuNewTerminalIcon,
      menuCopyIcon,
      menuSettingsIcon,
      handleCreateDraftTab,
      handleCreateTerminal,
      handleCreateTerminalWithProfile,
      handleCreateBrowserTab,
      handleOpenReviewTool,
      handleOpenFileTool,
      handleOpenSideChatTab,
      openImportSheet,
      handleCopyWorkspacePath,
      handleCopyBranchName,
      handleOpenSetupTab,
      handleScriptTerminalStarted,
      handleViewScriptTerminal,
      handleOpenUrlInBrowserTab,
    ],
  );
  const workspaceHeaderNode = useMemo(
    () =>
      showScreenHeader ? (
        <ScreenHeader
          onRowLayout={onHeaderLayout}
          borderless
          rowHeight={isMobile ? undefined : WORKSPACE_SECONDARY_HEADER_HEIGHT}
          left={headerLeft}
          right={headerRight}
        />
      ) : null,
    [showScreenHeader, onHeaderLayout, headerLeft, headerRight, isMobile],
  );
  const renderSplitPaneHeader = useCallback(
    function renderSplitPaneHeader(paneId: string) {
      return paneId === MAIN_PANE_ID ? workspaceHeaderNode : null;
    },
    [workspaceHeaderNode],
  );
  const desktopSplitContent = useMemo(() => {
    if (!canRenderDesktopPaneSplits || !workspaceRenderLayout || !persistenceKey) {
      return null;
    }
    const splitContainer = (
      <SplitContainer
        layout={workspaceRenderLayout}
        focusModeEnabled={desktopFocusModeEnabled}
        workspaceKey={persistenceKey}
        normalizedServerId={normalizedServerId}
        normalizedWorkspaceId={normalizedWorkspaceId}
        isWorkspaceFocused={isRouteFocused}
        uiTabs={uiTabs}
        hoveredCloseTabKey={hoveredCloseTabKey}
        setHoveredCloseTabKey={setHoveredCloseTabKey}
        closingTabIds={closingTabIds}
        onNavigateTab={navigateToTabId}
        onCloseTab={handleCloseTabById}
        onCopyResumeCommand={handleCopyResumeCommand}
        onCopyAgentId={handleCopyAgentId}
        onCopyFilePath={handleCopyFilePath}
        onReloadAgent={handleReloadAgent}
        onRenameTab={handleRenameTab}
        onCloseTabsToLeft={handleCloseTabsToLeftInPane}
        onCloseTabsToRight={handleCloseTabsToRightInPane}
        onCloseOtherTabs={handleCloseOtherTabsInPane}
        onCreateDraftTab={handleCreateDraftTab}
        onCreateTerminalTab={handleCreateTerminal}
        onCreateBrowserTab={handleCreateBrowserTab}
        toolsAddHandlers={toolsAddHandlers}
        showCreateBrowserTab={showCreateBrowserTab}
        buildPaneContentModel={buildDesktopPaneContentModel}
        onFocusPane={handleFocusPane}
        onSplitPane={handleSplitPane}
        onSplitPaneEmpty={handleCreateDraftSplit}
        onMoveTabToPane={handleMoveTabToPane}
        onResizeSplit={handleResizePaneSplit}
        onReorderTabsInPane={handleReorderTabsInPane}
        renderPaneEmptyState={renderSplitPaneEmptyState}
        renderPaneTabBarTrailing={renderSplitPaneTabBarTrailing}
        renderPaneHeader={renderSplitPaneHeader}
        rightPanelCollapsing={rightPanelExiting}
      />
    );
    // Maximized: tool fills the canvas, conversation composer docks at the bottom.
    if (maximizedComposerDock) {
      return (
        <View style={styles.maximizedCanvas}>
          <View style={styles.maximizedToolArea}>{splitContainer}</View>
          {maximizedComposerDock}
        </View>
      );
    }
    return splitContainer;
  }, [
    canRenderDesktopPaneSplits,
    workspaceRenderLayout,
    maximizedComposerDock,
    persistenceKey,
    desktopFocusModeEnabled,
    normalizedServerId,
    normalizedWorkspaceId,
    isRouteFocused,
    uiTabs,
    hoveredCloseTabKey,
    closingTabIds,
    navigateToTabId,
    handleCloseTabById,
    handleCopyResumeCommand,
    handleCopyAgentId,
    handleCopyFilePath,
    handleReloadAgent,
    handleRenameTab,
    handleCloseTabsToLeftInPane,
    handleCloseTabsToRightInPane,
    handleCloseOtherTabsInPane,
    handleCreateDraftTab,
    handleCreateTerminal,
    handleCreateBrowserTab,
    toolsAddHandlers,
    showCreateBrowserTab,
    buildDesktopPaneContentModel,
    handleFocusPane,
    handleSplitPane,
    handleCreateDraftSplit,
    handleMoveTabToPane,
    handleResizePaneSplit,
    handleReorderTabsInPane,
    renderSplitPaneEmptyState,
    renderSplitPaneTabBarTrailing,
    renderSplitPaneHeader,
    rightPanelExiting,
  ]);
  const desktopContent = desktopSplitContent ?? content;

  const workspaceCenterColumn = (
    <View style={styles.centerColumn}>
      {isMobile ? workspaceHeaderNode : null}

      {isMobile ? (
        <MobileWorkspaceTabSwitcher
          tabs={tabs}
          activeTabKey={activeTabKey}
          activeTab={activeTabDescriptor}
          tabSwitcherOptions={tabSwitcherOptions}
          tabByKey={tabByKey}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onSelectSwitcherTab={handleSelectSwitcherTab}
          onCopyResumeCommand={handleCopyResumeCommand}
          onCopyAgentId={handleCopyAgentId}
          onCopyFilePath={handleCopyFilePath}
          onReloadAgent={handleReloadAgent}
          onRenameTab={handleRenameTab}
          onCloseTab={handleCloseTabById}
          onCloseTabsAbove={handleCloseTabsToLeft}
          onCloseTabsBelow={handleCloseTabsToRight}
          onCloseOtherTabs={handleCloseOtherTabs}
        />
      ) : null}

      {shouldRenderDesktopPaneFallback ? (
        <WorkspaceDesktopTabsRow
          paneId={focusedPaneIdOrUndefined}
          isFocused={isRouteFocused}
          tabs={desktopTabRowItems}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          setHoveredCloseTabKey={setHoveredCloseTabKey}
          onNavigateTab={navigateToTabId}
          onCloseTab={handleCloseTabById}
          onCopyResumeCommand={handleCopyResumeCommand}
          onCopyAgentId={handleCopyAgentId}
          onCopyFilePath={handleCopyFilePath}
          onReloadAgent={handleReloadAgent}
          onRenameTab={handleRenameTab}
          onCloseTabsToLeft={handleCloseTabsToLeft}
          onCloseTabsToRight={handleCloseTabsToRight}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCreateDraftTab={handleCreateDraftTab}
          onCreateTerminalTab={handleCreateTerminal}
          onCreateBrowserTab={handleCreateBrowserTab}
          showCreateBrowserTab={showCreateBrowserTab}
          disableCreateTerminal={createTerminalMutation.isPending}
          isWaitingOnTerminalReadiness={pendingTerminalCreateInput !== null}
          onReorderTabs={handleReorderTabsInFocusedPane}
          onSplitRight={noop}
          onSplitDown={noop}
          showPaneSplitActions={false}
        />
      ) : null}

      <View style={styles.centerContent}>
        {isMobile ? (
          <View style={styles.content}>{content}</View>
        ) : (
          <View style={styles.content}>{desktopContent}</View>
        )}
      </View>
    </View>
  );

  return (
    gatedWorkspaceScreen ?? (
      <WorkspaceFocusProvider workspaceKey={persistenceKey}>
        <RenderProfile id="WorkspaceScreenContent">
          <View style={containerStyle}>
            <WorkspaceDocumentTitleEffectSlot
              tab={activeTabDescriptor}
              serverId={normalizedServerId}
              workspaceId={normalizedWorkspaceId}
              isRouteFocused={isRouteFocused}
            />
            <View style={styles.threePaneRow}>
              <FloatingPanelPortalHostNameProvider hostName={workspaceFloatingPanelPortalHostName}>
                {workspaceCenterColumn}
              </FloatingPanelPortalHostNameProvider>

              <FloatingPanelPortalHost name={workspaceFloatingPanelPortalHostName} />
            </View>
            <ImportSessionSheet
              visible={isImportSheetVisible}
              client={client}
              serverId={normalizedServerId}
              cwd={workspaceDirectory}
              onClose={closeImportSheet}
              onImportedAgent={handleImportedAgent}
            />
            <WorkspaceTabRenameModal
              renamingTab={renamingTab}
              onSubmit={handleRenameModalSubmit}
              onClose={handleRenameModalClose}
            />
          </View>
        </RenderProfile>
      </WorkspaceFocusProvider>
    )
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  // Maximized tool panel: vertical stack of the full-canvas tool over the docked composer.
  maximizedCanvas: {
    flex: 1,
    minHeight: 0,
  },
  maximizedToolArea: {
    flex: 1,
    minHeight: 0,
  },
  maximizedComposerDock: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  containerWorkspaceBackground: {
    backgroundColor: theme.colors.surfaceWorkspace,
  },
  threePaneRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
  },
  centerColumn: {
    flex: 1,
    minHeight: 0,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  headerTitleContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
    overflow: "hidden",
  },
  headerTitleTextGroup: {
    minWidth: 0,
    overflow: "hidden",
    flexShrink: 1,
    flexGrow: {
      xs: 1,
      md: 0,
    },
    flexDirection: {
      xs: "column",
      md: "row",
    },
    alignItems: {
      xs: "flex-start",
      md: "center",
    },
    justifyContent: "flex-start",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  headerProjectTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: {
      xs: theme.fontSize.sm,
      md: theme.fontSize.base,
    },
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "60%",
  },
  headerTitleSkeleton: {
    width: 220,
    maxWidth: "100%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: theme.spacing[1],
      md: theme.spacing[2],
    },
  },
  headerActionButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  compactHeaderActionButton: {
    width: theme.spacing[8],
    height: theme.spacing[8],
    padding: 0,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  compactHeaderMenuCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: {
      xs: 0,
      md: theme.spacing[2],
    },
  },
  sourceControlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    minHeight: Math.ceil(theme.fontSize.sm * 1.5) + theme.spacing[1] * 2,
    minWidth: Math.ceil(theme.fontSize.sm * 1.5) + theme.spacing[1] * 2,
    borderRadius: theme.borderRadius.md,
  },
  sourceControlButtonWithStats: {
    paddingHorizontal: theme.spacing[3],
  },
  sourceControlButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  toolPanelToggleHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  newTabActionButton: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  explorerTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  explorerTooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
  explorerTooltipShortcut: {},
  mobileTabsRow: {
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  switcherTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2] + theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  switcherTriggerPressed: {
    backgroundColor: theme.colors.surface1,
  },
  switcherTriggerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  switcherTriggerIcon: {
    flexShrink: 0,
  },
  switcherTriggerText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  mobileTabMenuTrigger: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileTabMenuTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  menuItemHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  headerMenuProfileIconWrapper: {
    width: 16,
    height: 16,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
  },
  tabsScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  centerContent: {
    flex: 1,
    minHeight: 0,
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 260,
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: theme.colors.surface2,
  },
  tabHovered: {
    backgroundColor: theme.colors.surface2,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonShown: {
    opacity: 1,
  },
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
    position: "relative",
  },
  mobileMountedTabSlotVisible: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  mobileMountedTabSlotHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  contentPlaceholder: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));

const containerWithWorkspaceBackgroundStyle = [
  styles.container,
  styles.containerWorkspaceBackground,
];

const REVIEW_TOGGLE_KEYS: ShortcutKey[] = ["mod", "shift", "G"];
const TOOL_PANEL_TOGGLE_KEYS: ShortcutKey[] = ["mod", "alt", "B"];
const EMPTY_SHORTCUT_KEYS: ShortcutKey[] = [];
