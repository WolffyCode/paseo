import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DaemonClient, DaemonEvent } from "@getpaseo/client";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { reaction } from "mobx";
import { z } from "zod";
import { getIsElectron, isWeb } from "@/constants/platform";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { generateDraftId } from "@/stores/draft-keys";
import { confirmDialog } from "@/utils/confirm-dialog";
import { shellModel } from "../../model/shell-model";
import { openConversationInPanel } from "../../right-panel/data/workspace-panels";
import {
  ConversationTreeStore,
  type ConversationTreeContext,
  type ConversationTreePreferences,
  type ConversationTreeStoreDeps,
} from "../model/conversation-tree-store";
import {
  mergeConversationTreePins,
  readConversationTreePins,
  SIDEBAR_PINS_STORAGE_KEY,
} from "../model/pin-state";
import { selectFileManagerTargetId, type DesktopOpenTarget } from "../model/reveal-target";
import {
  createConversationTreeData,
  type ConversationTreeRpcClient,
} from "./conversation-tree-data";

export const CONVERSATION_TREE_COLLAPSED_STORAGE_KEY = "conversation-tree-collapsed-projects";

const CollapsedProjectsSchema = z.object({
  collapsedByServerId: z.record(z.string(), z.array(z.string())),
});

interface ConversationTreeDesktopBridge {
  readonly editor?: {
    readonly listTargets?: () => Promise<DesktopOpenTarget[]>;
    readonly openTarget?: (input: {
      editorId: string;
      path: string;
      mode: "reveal";
    }) => Promise<void>;
  };
  readonly window?: {
    readonly openNew?: (input: { pendingOpenProjectPath: string }) => Promise<void>;
  };
}

interface PersistedCollapsedProjects {
  readonly collapsedByServerId: Record<string, string[]>;
}

interface PersistedPreferenceSnapshot {
  readonly pins: ConversationTreeStore["pins"];
  readonly collapsedProjectKeys: readonly string[];
}

export interface ConversationTreeHostDeps {
  readonly openSearch: () => void;
  readonly retargetConversationView: (input: {
    readonly draftId: string;
    readonly agentId: string;
  }) => void;
}

/** Identify a missing live daemon client without reducing the failure to an opaque string. */
class ConversationTreeHostDisconnectedError extends Error {
  readonly serverId: string;

  /** Preserve the host identity so diagnostics can distinguish simultaneous host failures. */
  constructor(serverId: string) {
    super(`Host ${serverId} is disconnected`);
    this.name = "ConversationTreeHostDisconnectedError";
    this.serverId = serverId;
  }
}

/** Identify a route outside the two destinations owned by the conversation tree. */
class UnsupportedConversationTreeRouteError extends Error {
  readonly route: string;

  /** Preserve the rejected route for diagnostics without widening the navigation port. */
  constructor(route: string) {
    super(`Unsupported conversation tree route: ${route}`);
    this.name = "UnsupportedConversationTreeRouteError";
    this.route = route;
  }
}

/** Construct one store whose data, persistence, and side-effect ports remain keyed to a server. */
export function createConversationTreeStoreForServer(
  serverId: string,
  hostDeps: ConversationTreeHostDeps,
): ConversationTreeStore {
  const reportError = createActionErrorReporter();
  const store = new ConversationTreeStore({
    data: createConversationTreeData({
      client: liveRpcClient(serverId),
      subscriptionIdPrefix: `conversation-tree:${serverId}`,
    }),
    openConversationInRightPanel: (input) => {
      shellModel.openRight();
      openConversationInPanel(serverId, {
        kind: "conversation",
        target: { kind: "agent", agentId: input.agentId },
        workspaceId: input.workspaceId,
        title: input.title,
        readOnly: input.readOnly,
      });
    },
    navigate: navigateConversationTreeRoute,
    openInFinder,
    openInNewWindow,
    copyToClipboard,
    confirmDestructive: confirmProjectRemoval,
    reportError,
    openSearch: hostDeps.openSearch,
    createDraftId: generateDraftId,
    retargetConversationView: hostDeps.retargetConversationView,
    getContext: () => buildContext(serverId),
  });
  store.beginPreferenceHydration();
  store.registerDisposer(startPreferencePersistence(store, serverId, reportError));
  store.registerDisposer(reloadAfterClientReplacement(store, serverId));
  void store.load();
  return store;
}

/** Parse the store's narrow string port into Expo's two statically typed destination objects. */
function navigateConversationTreeRoute(route: string): void {
  const url = new URL(route, "https://paseo.local");
  const segments = url.pathname.split("/").filter(Boolean);
  const hasKnownShape = segments.length === 3 && segments[0] === "h";
  if (!hasKnownShape) {
    throw new UnsupportedConversationTreeRouteError(route);
  }
  const serverId = decodeURIComponent(segments[1] ?? "");
  const destination = segments[2];
  if (destination === "open-project") {
    router.navigate({ pathname: "/h/[serverId]/open-project", params: { serverId } });
    return;
  }
  if (destination === "new") {
    router.navigate({
      pathname: "/h/[serverId]/new",
      params: {
        serverId,
        dir: url.searchParams.get("dir") ?? undefined,
        name: url.searchParams.get("name") ?? undefined,
        projectId: url.searchParams.get("projectId") ?? undefined,
      },
    });
    return;
  }
  throw new UnsupportedConversationTreeRouteError(route);
}

/** Resolve every RPC against the current client and rebind stream listeners after reconnect swaps it. */
function liveRpcClient(serverId: string): ConversationTreeRpcClient {
  return {
    /** Fetch agent pages through the client that is live at call time. */
    fetchAgents(options) {
      return requireClient(serverId).fetchAgents(options);
    },
    /** Fetch workspace pages through the client that is live at call time. */
    fetchWorkspaces(options) {
      return requireClient(serverId).fetchWorkspaces(options);
    },
    /** Keep one logical listener attached across physical client replacement. */
    subscribe(handler) {
      return subscribeToLiveClient(serverId, handler);
    },
    /** Rename a project through the client that is live at call time. */
    renameProject(projectId, customName, requestId) {
      return requireClient(serverId).renameProject(projectId, customName, requestId);
    },
    /** Remove a project through the client that is live at call time. */
    removeProject(projectId, requestId) {
      return requireClient(serverId).removeProject(projectId, requestId);
    },
    /** Set a workspace title through the client that is live at call time. */
    setWorkspaceTitle(workspaceId, title, requestId) {
      return requireClient(serverId).setWorkspaceTitle(workspaceId, title, requestId);
    },
  };
}

/** Return the current connected client or fail the requested operation explicitly. */
function requireClient(serverId: string): DaemonClient {
  const client = getHostRuntimeStore().getClient(serverId);
  if (client === null) {
    throw new ConversationTreeHostDisconnectedError(serverId);
  }
  return client;
}

/** Follow host-runtime client identity and move a local daemon listener to each replacement. */
function subscribeToLiveClient(
  serverId: string,
  handler: (event: DaemonEvent) => void,
): () => void {
  const runtime = getHostRuntimeStore();
  let currentClient: DaemonClient | null = null;
  let stopClient = (): void => {};

  /** Reattach only when host runtime exposes a different physical client instance. */
  function attachCurrentClient(): void {
    const nextClient = runtime.getClient(serverId);
    if (nextClient === currentClient) {
      return;
    }
    stopClient();
    currentClient = nextClient;
    stopClient = nextClient === null ? () => {} : nextClient.subscribe(handler);
  }

  attachCurrentClient();
  const stopRuntime = runtime.subscribe(serverId, attachCurrentClient);
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    stopRuntime();
    stopClient();
  };
}

/** Refresh both snapshots when reconnect replaces the underlying daemon client. */
function reloadAfterClientReplacement(store: ConversationTreeStore, serverId: string): () => void {
  const runtime = getHostRuntimeStore();
  let currentClient = runtime.getClient(serverId);
  return runtime.subscribe(serverId, () => {
    const nextClient = runtime.getClient(serverId);
    if (nextClient === currentClient) {
      return;
    }
    currentClient = nextClient;
    if (isHostRuntimeConnected(runtime.getSnapshot(serverId))) {
      void store.load();
    }
  });
}

/** Read current platform and connection facts without copying them into MobX state. */
function buildContext(serverId: string): ConversationTreeContext {
  const runtime = getHostRuntimeStore();
  return {
    serverId,
    isElectron: getIsElectron(),
    isOffline: !isHostRuntimeConnected(runtime.getSnapshot(serverId)),
  };
}

/** Resolve the platform file-manager target and reveal one absolute path through preload. */
async function openInFinder(absolutePath: string): Promise<void> {
  const desktop = desktopBridge();
  const listTargets = desktop?.editor?.listTargets;
  const openTarget = desktop?.editor?.openTarget;
  if (typeof listTargets !== "function" || typeof openTarget !== "function") {
    return;
  }
  const targetId = selectFileManagerTargetId(await listTargets());
  if (targetId !== null) {
    await openTarget({ editorId: targetId, path: absolutePath, mode: "reveal" });
  }
}

/** Open one workspace directory in a new Electron window when preload exposes the capability. */
function openInNewWindow(absolutePath: string): void {
  const openNew = desktopBridge()?.window?.openNew;
  if (typeof openNew === "function") {
    void openNew({ pendingOpenProjectPath: absolutePath }).catch((error) => {
      showActionError(errorMessage(error));
    });
  }
}

/** Copy model-selected text through Expo's cross-platform clipboard implementation. */
function copyToClipboard(text: string): void {
  void Clipboard.setStringAsync(text).catch((error) => {
    showActionError(errorMessage(error));
  });
}

/** Ask the shared platform dialog to confirm project removal without deleting disk content. */
function confirmProjectRemoval(input: { title: string; body: string }): Promise<boolean> {
  return confirmDialog({
    title: input.title,
    message: input.body,
    confirmLabel: "移除",
    cancelLabel: "取消",
    destructive: true,
  });
}

/** Create the store's synchronous error port over the desktop renderer's visible alert surface. */
function createActionErrorReporter(): ConversationTreeStoreDeps["reportError"] {
  return (input) => showActionError(input.message);
}

/** Present one action failure without importing a legacy toast or component tree. */
function showActionError(message: string): void {
  const alert = (globalThis as { alert?: (message: string) => void }).alert;
  if (typeof alert === "function") {
    alert(message);
  }
}

/** Read the Electron preload bridge only behind the web and Electron platform gates. */
function desktopBridge(): ConversationTreeDesktopBridge | null {
  if (!isWeb || !getIsElectron()) {
    return null;
  }
  const desktopGlobal = globalThis as { paseoDesktop?: ConversationTreeDesktopBridge };
  return desktopGlobal.paseoDesktop ?? null;
}

/** Hydrate preferences, then persist each observable replacement until the store is disposed. */
function startPreferencePersistence(
  store: ConversationTreeStore,
  serverId: string,
  reportError: ConversationTreeStoreDeps["reportError"],
): () => void {
  let stopped = false;
  let stopReaction = (): void => {};
  let persistQueue = Promise.resolve();

  /** Serialize preference writes so rapid toggles cannot let an older AsyncStorage write win. */
  function enqueuePersist(snapshot: PersistedPreferenceSnapshot): void {
    persistQueue = persistQueue
      .then(() => {
        if (stopped) {
          return Promise.resolve();
        }
        return persistPreferences(serverId, snapshot);
      })
      .catch((error) => {
        if (!stopped) {
          reportError({ action: "pin", message: errorMessage(error) });
        }
        return undefined;
      });
  }

  /** Load both records before arming reactions so hydration never triggers a redundant write. */
  async function hydrate(): Promise<void> {
    try {
      const [rawPins, rawCollapsed] = await Promise.all([
        AsyncStorage.getItem(SIDEBAR_PINS_STORAGE_KEY),
        AsyncStorage.getItem(CONVERSATION_TREE_COLLAPSED_STORAGE_KEY),
      ]);
      if (stopped) {
        return;
      }
      const preferences: ConversationTreePreferences = {
        pins: readConversationTreePins(parseStoredJson(rawPins), serverId),
        collapsedProjectKeys: readCollapsedProjectKeys(parseStoredJson(rawCollapsed), serverId),
      };
      store.hydratePreferences(preferences);
      stopReaction = reaction(
        () => ({
          pins: store.pins,
          collapsedProjectKeys: Array.from(store.collapsedProjectKeys),
        }),
        enqueuePersist,
      );
    } catch (error) {
      if (!stopped) {
        store.finishPreferenceHydration();
        reportError({ action: "pin", message: errorMessage(error) });
      }
    }
  }

  void hydrate();
  return () => {
    stopped = true;
    stopReaction();
  };
}

/** Persist shared pins and server-keyed collapse state from their latest storage snapshots. */
async function persistPreferences(
  serverId: string,
  snapshot: PersistedPreferenceSnapshot,
): Promise<void> {
  const [rawPins, rawCollapsed] = await Promise.all([
    AsyncStorage.getItem(SIDEBAR_PINS_STORAGE_KEY),
    AsyncStorage.getItem(CONVERSATION_TREE_COLLAPSED_STORAGE_KEY),
  ]);
  const pins = mergeConversationTreePins(parseStoredJson(rawPins), serverId, snapshot.pins);
  const collapsed = mergeCollapsedProjectKeys(
    parseStoredJson(rawCollapsed),
    serverId,
    snapshot.collapsedProjectKeys,
  );
  await Promise.all([
    AsyncStorage.setItem(SIDEBAR_PINS_STORAGE_KEY, JSON.stringify(pins)),
    AsyncStorage.setItem(CONVERSATION_TREE_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed)),
  ]);
}

/** Parse JSON storage through one boundary and treat corrupt records as absent preferences. */
function parseStoredJson(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read one server's collapsed project identities from the validated persistence record. */
function readCollapsedProjectKeys(value: unknown, serverId: string): ReadonlySet<string> {
  const parsed = CollapsedProjectsSchema.safeParse(value);
  if (!parsed.success) {
    return new Set();
  }
  return new Set(parsed.data.collapsedByServerId[serverId] ?? []);
}

/** Replace one server's collapse record while retaining every other host's preferences. */
function mergeCollapsedProjectKeys(
  value: unknown,
  serverId: string,
  collapsedProjectKeys: readonly string[],
): PersistedCollapsedProjects {
  const parsed = CollapsedProjectsSchema.safeParse(value);
  const collapsedByServerId = parsed.success ? { ...parsed.data.collapsedByServerId } : {};
  if (collapsedProjectKeys.length === 0) {
    delete collapsedByServerId[serverId];
  } else {
    collapsedByServerId[serverId] = [...new Set(collapsedProjectKeys)];
  }
  return { collapsedByServerId };
}

/** Normalize caught platform and storage values into diagnostic text for the error port. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
