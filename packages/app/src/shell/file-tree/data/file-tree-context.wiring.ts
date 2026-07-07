// File-tree context wiring — the composition root that connects the file tree to a live server
// (standards §8 / architecture §9 ③, the THIRD registered seam). It is the ONLY file in this directory
// that reads the old session-store + host-runtime to obtain the connected DaemonClient and the runtime
// context (capabilities / draft / connection / workspace). The store/data/components stay zero-touch on
// old modules; everything old-facing is funneled here.
//
// Why a seam: "connect to the server" needs the live client + session/runtime facts, which today live
// in the old session-store and host-runtime. Injecting them here keeps the new directory isolated.
// Future switch point: when session-store / host-runtime are rebuilt into the new shell, change ONLY
// this file — the store keeps consuming FileTreeStoreDeps unchanged.
//
// The client is read FRESH per RPC (a reconnect swaps the DaemonClient instance), and getContext()
// reads FRESH per call, so capability/draft/connection changes are reflected without store-side copies.

import { getIsElectron } from "@/constants/platform";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { createFileTreeData, type FileTreeRpcClient } from "./file-tree-data";
import { composerBridge } from "../model/composer-bridge.wiring";
import { FileTreeStore } from "../model/file-tree-store";
import type { ConfirmDeleteInput, FileTreeContext } from "../model/file-tree-store";
import { rightTabBridge } from "../model/right-tab-bridge.wiring";
import { copyTextToClipboard } from "../util/clipboard";
import { pickDirectory } from "../util/pick-directory";
import { revealInFinder } from "../util/reveal";

// The active agent id for a server's current conversation, used to build the composer draft key. The
// home/skeleton milestone has no active conversation, so this is null and "add to chat" stays disabled.
// When the conversation-content milestone lands a real agent id, return it here (only this seam changes).
function activeAgentId(_serverId: string): string | null {
  return null;
}

// A DaemonClient proxy that resolves the live client per call from the host runtime, so a reconnect
// (new client instance) is transparent to the data layer. Throws if disconnected — the store catches
// the failure and the offline panelState (checked first) takes precedence anyway.
function liveRpcClient(serverId: string): FileTreeRpcClient {
  const client = (): NonNullable<ReturnType<typeof currentClient>> => {
    const c = currentClient(serverId);
    if (!c) {
      throw new Error("Host disconnected");
    }
    return c;
  };
  return {
    listDirectory: (cwd, path) => client().listDirectory(cwd, path),
    fsSearch: (input, opts) => client().fsSearch(input, opts),
    fsCreate: (root, path) => client().fsCreate(root, path),
    fsMkdir: (root, path) => client().fsMkdir(root, path),
    fsRename: (root, path, newName) => client().fsRename(root, path, newName),
    fsMove: (root, from, toDir) => client().fsMove(root, from, toDir),
    fsCopy: (root, from, toDir) => client().fsCopy(root, from, toDir),
    fsDelete: (root, path) => client().fsDelete(root, path),
  };
}

// The current connected client for a server (null when disconnected / unknown server).
function currentClient(serverId: string) {
  return getHostRuntimeStore().getSnapshot(serverId)?.client ?? null;
}

// Build the live context the store reads fresh: workspace identity (for right-tab persistence keys),
// the conversation root (→ default tree root), the draft key (→ add-to-chat enablement), the host
// capability flags (→ search/write gates), and the connection state (→ offline panel).
function buildContext(serverId: string, workspaceId: string): FileTreeContext {
  const session = useSessionStore.getState().getSession(serverId);
  const conversationRoot = session?.workspaces.get(workspaceId)?.projectRootPath ?? null;
  const agentId = activeAgentId(serverId);
  const draftKey = agentId ? buildDraftStoreKey({ serverId, agentId }) : null;
  return {
    serverId,
    workspaceId,
    conversationRoot,
    draftKey,
    features: session?.serverInfo?.features ?? {},
    isElectron: getIsElectron(),
    hasActiveDraft: draftKey !== null,
    isOffline: !isHostRuntimeConnected(getHostRuntimeStore().getSnapshot(serverId)),
  };
}

// Show the delete confirmation through the shared cross-platform confirm dialog (native Alert / desktop
// dialog / web confirm). A directory warns about recursive removal. Resolves true only on accept. Lives
// in this seam because confirmDialog reaches the old desktop host; the store consumes it as a port.
function confirmDeletion(input: ConfirmDeleteInput): Promise<boolean> {
  const what = input.isDirectory ? "文件夹" : "文件";
  return confirmDialog({
    title: `删除${what}`,
    message: input.isDirectory
      ? `确定要删除文件夹"${input.name}"及其全部内容吗？此操作无法撤销。`
      : `确定要删除"${input.name}"吗？此操作无法撤销。`,
    confirmLabel: "删除",
    cancelLabel: "取消",
    destructive: true,
  });
}

// Construct a FileTreeStore wired to the live server. One store per (serverId, workspaceId); the shell
// memoizes it across renders and rebuilds it when the workspace changes (architecture §1 lifecycle).
export function createFileTreeStoreForServer(serverId: string, workspaceId: string): FileTreeStore {
  return new FileTreeStore({
    data: createFileTreeData(liveRpcClient(serverId)),
    composer: composerBridge,
    rightTab: rightTabBridge,
    revealInFinder,
    // The clipboard port is fire-and-forget; the store ignores the returned promise.
    copyToClipboard: (text) => {
      void copyTextToClipboard(text);
    },
    pickDirectory,
    confirmDestructive: confirmDeletion,
    getContext: () => buildContext(serverId, workspaceId),
  });
}

// The current conversation root for a (serverId, workspaceId), exported so the panel can feed it as the
// ensureRoot external/conversation input and re-run when it changes — kept in this seam so the panel
// itself reads no old session-store.
export function readConversationRoot(serverId: string, workspaceId: string): string | null {
  return (
    useSessionStore.getState().getSession(serverId)?.workspaces.get(workspaceId)?.projectRootPath ??
    null
  );
}
