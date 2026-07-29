import { observer } from "mobx-react-lite";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { getIsElectronMac } from "@/constants/platform";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppSettings } from "@/hooks/use-settings";
import { DEFAULT_LOCALE, parseAppLanguage } from "@/i18n/locales";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { createConversationTreeStoreForServer } from "../conversation-tree/data/conversation-tree-context.wiring";
import type { ConversationTreeStore } from "../conversation-tree/model/conversation-tree-store";
import { i18nModel } from "../i18n/i18n-model";
import { type ShellContext, shellModel } from "../model/shell-model";
import { buildConversationViewKey } from "../model/conversation-view-key";
import { ConversationPanels } from "../right-panel/data/conversation-panels";
import {
  createRightPanelForServer,
  type RightPanel,
} from "../right-panel/data/right-panel-context.wiring";
import { WINDOW_PADDING } from "../theme/shell-tokens";
import { resolveThemeScheme, themeModel } from "../theme/theme-model";
import { FileTreeRegion } from "./file-tree-region";
import { ConversationRegion } from "./conversation-region";
import { resolveConversationRegionTarget } from "./conversation-region-model";
import { LeftRegion } from "./left-region";
import { RightPanelRegion } from "./right-panel-region";
import { RegionFrame } from "./region-frame";
import { RegionGutter } from "./region-gutter";
import { RegionPlaceholder } from "./region-placeholder";
import { SettingsEntry } from "./settings-entry";
import { ShellBackdrop } from "./shell-backdrop";
import { TopBar } from "./top-bar";

// The one bridge from app inputs to the shell models: the route context, the theme scheme
// (derived from the app's own settings + system scheme — never a style-factory colorScheme),
// and the locale (mirrored from the app's already-resolved i18n language). Layout effects so
// the models are current before paint (no first-frame flash). This is the single writer for
// setContext/setScheme/setLocale; no component reaches the external sources itself.
function useShellBridge(ctx: ShellContext, conversationViewKey: string | null): void {
  const { settings } = useAppSettings();
  const systemScheme = useColorScheme();
  const { i18n } = useTranslation();
  const language = i18n.language;

  useLayoutEffect(() => {
    shellModel.setContext(ctx);
    shellModel.activateConversationView(conversationViewKey);
  }, [conversationViewKey, ctx]);

  useLayoutEffect(() => {
    themeModel.setScheme(resolveThemeScheme(settings.theme, systemScheme ?? null));
  }, [settings.theme, systemScheme]);

  useLayoutEffect(() => {
    const parsed = parseAppLanguage(language);
    i18nModel.setLocale(parsed && parsed !== "system" ? parsed : DEFAULT_LOCALE);
  }, [language]);
}

// The shell's route-level assembly. It feeds the models the route context + theme/locale,
// then lays out the window-wide top bar over the row of floating cards. Card order is fixed
// left → center → right → file tree, gutters between. Content milestones mount through their
// region components while deferred surfaces retain placeholders. Pure composition over
// the model — it reads computeds and renders, holding no layout state itself. `observer` so
// every model change repaints it.
export function ShellRoot({ ctx }: { ctx: ShellContext }) {
  const serverId = ctx.serverId ?? null;
  const { treeStore, searchOpen, closeSearch, conversationPanels } =
    useShellConversationView(serverId);
  return (
    <ShellLayout
      ctx={ctx}
      serverId={serverId}
      treeStore={treeStore}
      searchOpen={searchOpen}
      closeSearch={closeSearch}
      conversationPanels={conversationPanels}
    />
  );
}

/** Observe the active tree target directly so switching conversations recomputes the whole shell view. */
const ShellLayout = observer(function ShellLayout({
  ctx,
  serverId,
  treeStore,
  searchOpen,
  closeSearch,
  conversationPanels,
}: {
  ctx: ShellContext;
  serverId: string | null;
  treeStore: ConversationTreeStore | null;
  searchOpen: boolean;
  closeSearch: () => void;
  conversationPanels: ConversationPanels<RightPanel> | null;
}) {
  const { focusedWorkspaceId, conversationViewKey, newConversationWorkspaceId } =
    resolveShellConversationView(serverId, treeStore);
  const effectiveCtx = useMemo<ShellContext>(
    () => ({
      ...ctx,
      workspaceKey:
        serverId !== null && focusedWorkspaceId !== null
          ? `${serverId}:${focusedWorkspaceId}`
          : ctx.workspaceKey,
    }),
    [ctx, focusedWorkspaceId, serverId],
  );
  useShellBridge(effectiveCtx, conversationViewKey);

  const visible = shellModel.visibleRegions;
  const isSettings = shellModel.currentPage === "settings";
  const { showsShell, workspaceKey } = shellModel;
  // The shell-root base fill. On macOS Electron it is transparent so the half-transparent
  // ShellBackdrop is the ONLY layer behind the cards and the real desktop shows through it (the
  // app's transparent ancestor chain in _layout lets the desktop reach here). Off mac (browser web
  // + native) there is no desktop to reveal, so we paint the opaque flat backdrop as the base — a
  // white ancestor would otherwise show through. ShellBackdrop paints over this base (the bilinear
  // gradient on web/electron, a flat solid on native) as the first child, behind the top bar + cards.
  const backdrop = themeModel.tokens.backdrop;
  const rootBg = getIsElectronMac() ? "transparent" : backdrop;
  const rootStyle = useMemo(() => [styles.root, { backgroundColor: rootBg }], [rootBg]);
  return (
    <View style={rootStyle} testID="shell-root">
      <ShellBackdrop />
      {showsShell ? <TopBar /> : null}
      <View style={styles.row}>
        {visible.left != null ? (
          <Fragment>
            <RegionFrame kind="sidebar" width={visible.left}>
              <LeftRegionContent
                isSettings={isSettings}
                serverId={serverId}
                store={treeStore}
                searchOpen={searchOpen}
                onCloseSearch={closeSearch}
              />
              {isSettings ? null : <SettingsEntry />}
            </RegionFrame>
            <RegionGutter region="left" currentWidth={visible.left} />
          </Fragment>
        ) : null}

        {/* Center canvas — hidden when the right panel is maximized (it flex-fills the freed space; the
            selector surfaces rightMaximized only for an open right panel on the conversation page). */}
        {visible.rightMaximized ? null : (
          <RegionFrame kind="main">
            <CenterRegionContent isSettings={isSettings} serverId={serverId} store={treeStore} />
          </RegionFrame>
        )}

        {visible.right != null && workspaceKey != null ? (
          <Fragment>
            {/* Maximized: drop the resize gutter and flex the right frame over the hidden center; docked:
                fixed remembered width with a gutter. Left rail + file tree stay put either way. */}
            {visible.rightMaximized ? null : (
              <RegionGutter
                region="right"
                workspaceKey={workspaceKey}
                currentWidth={visible.right}
              />
            )}
            <RegionFrame
              kind={visible.rightMaximized ? "main" : "content"}
              width={visible.rightMaximized ? undefined : visible.right}
            >
              {serverId !== null && conversationPanels !== null && conversationViewKey !== null ? (
                <RightPanelRegion
                  serverId={serverId}
                  workspaceKey={workspaceKey}
                  newConversationWorkspaceId={newConversationWorkspaceId}
                  conversationPanels={conversationPanels}
                  conversationViewKey={conversationViewKey}
                />
              ) : (
                <RegionPlaceholder variant="right" />
              )}
            </RegionFrame>
          </Fragment>
        ) : null}

        {visible.fileTree != null && workspaceKey != null ? (
          <Fragment>
            <RegionGutter
              region="fileTree"
              workspaceKey={workspaceKey}
              currentWidth={visible.fileTree}
            />
            <RegionFrame kind="content" width={visible.fileTree}>
              {serverId !== null ? (
                <FileTreeRegion serverId={serverId} workspaceKey={workspaceKey} />
              ) : (
                <RegionPlaceholder variant="fileTree" />
              )}
            </RegionFrame>
          </Fragment>
        ) : null}
      </View>
    </View>
  );
});

/** Own one host's conversation view identities and the Workbench instances attached to them. */
function useShellConversationView(serverId: string | null): {
  treeStore: ConversationTreeStore | null;
  searchOpen: boolean;
  closeSearch: () => void;
  conversationPanels: ConversationPanels<RightPanel> | null;
} {
  const conversationPanels = useMemo(
    () =>
      serverId === null
        ? null
        : new ConversationPanels<RightPanel>(serverId, createRightPanelForServer),
    [serverId],
  );
  useEffect(() => () => conversationPanels?.dispose(), [conversationPanels]);
  const retargetConversationView = useCallback(
    ({ draftId, agentId }: { draftId: string; agentId: string }): void => {
      if (serverId === null || conversationPanels === null) return;
      const fromViewKey = buildConversationViewKey(serverId, { kind: "draft", draftId });
      const toViewKey = buildConversationViewKey(serverId, { kind: "agent", agentId });
      shellModel.retargetConversationView(fromViewKey, toViewKey);
      conversationPanels.retarget(fromViewKey, toViewKey);
    },
    [conversationPanels, serverId],
  );
  const {
    store: treeStore,
    searchOpen,
    closeSearch,
  } = useShellConversationTree(serverId, retargetConversationView);
  return {
    treeStore,
    searchOpen,
    closeSearch,
    conversationPanels,
  };
}

/** Derive the current conversation identity and workspace from the observable tree source. */
function resolveShellConversationView(
  serverId: string | null,
  store: ConversationTreeStore | null,
): {
  focusedWorkspaceId: string | null;
  conversationViewKey: string | null;
  newConversationWorkspaceId: string | null;
} {
  const target = store
    ? resolveConversationRegionTarget({
        focusedRootId: store.focusedRootId,
        draftTarget: store.draftTarget,
        pendingAgentTarget: store.pendingAgentTarget,
        agents: store.agents,
        workspaceDetails: store.workspaceDetails,
      })
    : null;
  return {
    focusedWorkspaceId: target === null ? null : target.workspaceId,
    conversationViewKey:
      serverId === null || target === null ? null : buildConversationViewKey(serverId, target),
    newConversationWorkspaceId: store?.resolveNewConversationWorkspaceId() ?? null,
  };
}

function useShellConversationTree(
  serverId: string | null,
  retargetConversationView: (input: { draftId: string; agentId: string }) => void,
): {
  store: ConversationTreeStore | null;
  searchOpen: boolean;
  closeSearch: () => void;
} {
  const [treeMount, setTreeMount] = useState<{
    readonly serverId: string;
    readonly store: ConversationTreeStore;
  } | null>(null);
  const [shellSearchOpen, setShellSearchOpen] = useState(false);
  const openShellSearch = useCallback(() => setShellSearchOpen(true), []);
  const closeShellSearch = useCallback(() => setShellSearchOpen(false), []);
  const treeStore = treeMount?.serverId === serverId ? treeMount.store : null;

  const commandCenterOpen = useKeyboardShortcutsStore((state) => state.commandCenterOpen);
  useLayoutEffect(() => {
    if (commandCenterOpen) {
      useKeyboardShortcutsStore.getState().setCommandCenterOpen(false);
      setShellSearchOpen(true);
    }
  }, [commandCenterOpen]);

  useEffect(() => {
    if (serverId === null) {
      setTreeMount(null);
      return;
    }
    const runtime = getHostRuntimeStore();
    let nextStore: ConversationTreeStore | null = null;
    const mountWhenConnected = (): void => {
      if (nextStore !== null || !isHostRuntimeConnected(runtime.getSnapshot(serverId))) {
        return;
      }
      nextStore = createConversationTreeStoreForServer(serverId, {
        openSearch: openShellSearch,
        retargetConversationView,
      });
      setTreeMount({ serverId, store: nextStore });
    };
    const stopRuntime = runtime.subscribe(serverId, mountWhenConnected);
    mountWhenConnected();
    return () => {
      stopRuntime();
      nextStore?.dispose();
    };
  }, [openShellSearch, retargetConversationView, serverId]);
  return { store: treeStore, searchOpen: shellSearchOpen, closeSearch: closeShellSearch };
}

function CenterRegionContent({
  isSettings,
  serverId,
  store,
}: {
  isSettings: boolean;
  serverId: string | null;
  store: ConversationTreeStore | null;
}) {
  if (isSettings) {
    return <RegionPlaceholder variant="settingsContent" />;
  }
  if (serverId === null) {
    return <RegionPlaceholder variant="center" />;
  }
  return <ConversationRegion serverId={serverId} store={store} />;
}

function LeftRegionContent({
  isSettings,
  serverId,
  store,
  searchOpen,
  onCloseSearch,
}: {
  isSettings: boolean;
  serverId: string | null;
  store: ConversationTreeStore | null;
  searchOpen: boolean;
  onCloseSearch: () => void;
}) {
  if (isSettings) {
    return <RegionPlaceholder variant="settingsNav" />;
  }
  if (serverId !== null) {
    return (
      <LeftRegion
        serverId={serverId}
        store={store}
        searchOpen={searchOpen}
        onCloseSearch={onCloseSearch}
      />
    );
  }
  return <RegionPlaceholder variant="left" />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    flexDirection: "column",
    gap: 4,
    paddingTop: WINDOW_PADDING.top,
    paddingHorizontal: WINDOW_PADDING.horizontal,
    paddingBottom: WINDOW_PADDING.bottom,
  },
  row: { flex: 1, width: "100%", minWidth: 0, minHeight: 0, flexDirection: "row" },
});
