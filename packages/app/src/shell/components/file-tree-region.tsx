import { useEffect, useMemo } from "react";
import { useHostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { createFileTreeStoreForServer } from "../file-tree/data/file-tree-context.wiring";
import { FileTreePanel } from "../file-tree/components/file-tree-panel";
import { asFileTreeController } from "../file-tree/model/file-tree-public";
import { registerFileTreeAccess } from "../right-panel/data/workspace-panels";

// The shell-layer mount for the file tree (NOT inside shell/file-tree/, so it may read the old
// runtime/session reactively). It owns the store's lifecycle — one FileTreeStore per (serverId,
// workspaceId), rebuilt when the workspace changes — and feeds the panel the live offline + conversation
// root reads so the panel (an observer) repaints when connection or the conversation root flips. This
// keeps the file-tree components themselves zero-touch on old modules; all old-facing reads are here or
// in the registered wiring seam this calls.

// The workspaceId half of the shell's `${serverId}:${workspaceId}` workspace key.
function workspaceIdOf(workspaceKey: string, serverId: string): string {
  const prefix = `${serverId}:`;
  return workspaceKey.startsWith(prefix) ? workspaceKey.slice(prefix.length) : workspaceKey;
}

export function FileTreeRegion({
  serverId,
  workspaceKey,
}: {
  serverId: string;
  workspaceKey: string;
}) {
  const workspaceId = workspaceIdOf(workspaceKey, serverId);
  // One store per (serverId, workspaceId); a new workspace rebuilds it (clears tree/expand/selection).
  const store = useMemo(
    () => createFileTreeStoreForServer(serverId, workspaceId),
    [serverId, workspaceId],
  );
  // Expose this workspace's tree to the right panel (its root + reveal command) so an opened file tab can
  // root its document + drive tree reveal on activation. Cleared on unmount / workspace change.
  useEffect(
    () => registerFileTreeAccess(serverId, workspaceId, asFileTreeController(store)),
    [serverId, workspaceId, store],
  );
  // Reactive offline + conversation root reads so the observer panel repaints on change; the store also
  // reads these fresh via its context getter, but these subscriptions are what trigger the React repaint.
  const isOffline = useHostRuntimeConnectionStatus(serverId) !== "online";
  const conversationRoot = useSessionStore(
    (state) => state.sessions[serverId]?.workspaces.get(workspaceId)?.projectRootPath ?? null,
  );

  return <FileTreePanel store={store} conversationRoot={conversationRoot} isOffline={isOffline} />;
}
