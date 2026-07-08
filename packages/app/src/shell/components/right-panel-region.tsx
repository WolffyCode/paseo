import { useEffect, useMemo } from "react";
import { useHostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { createRightPanelForServer } from "../right-panel/data/right-panel-context.wiring";
import { registerRightPanelTarget } from "../right-panel/data/workspace-panels";
import { Workbench } from "../right-panel/components/workbench";

// The shell-layer mount for the right panel (NOT inside shell/right-panel/, so it may read the old
// runtime reactively). It owns the workbench's lifecycle — one WorkbenchModel + controller + editor-handle
// map per (serverId, workspaceId), rebuilt when the workspace changes (transient, per architecture §3.5) —
// registers the controller so the file-tree bridge can open files into it (draining any queued opens),
// and feeds the live offline read so the observer workbench freezes on disconnect. This keeps the
// right-panel components zero-touch on old modules; all old-facing reads live here or in the wiring seam.

// The workspaceId half of the shell's `${serverId}:${workspaceId}` workspace key.
function workspaceIdOf(workspaceKey: string, serverId: string): string {
  const prefix = `${serverId}:`;
  return workspaceKey.startsWith(prefix) ? workspaceKey.slice(prefix.length) : workspaceKey;
}

export function RightPanelRegion({
  serverId,
  workspaceKey,
}: {
  serverId: string;
  workspaceKey: string;
}) {
  const workspaceId = workspaceIdOf(workspaceKey, serverId);
  // One panel per (serverId, workspaceId); a new workspace rebuilds it (clears tabs — transient memory).
  const panel = useMemo(
    () => createRightPanelForServer(serverId, workspaceId),
    [serverId, workspaceId],
  );
  // Register the controller as the workspace's right-panel target so the file-tree bridge reaches it (and
  // any file queued while the panel was collapsed opens now). Unregister on unmount / workspace change.
  useEffect(
    () => registerRightPanelTarget(serverId, workspaceId, panel.controller),
    [serverId, workspaceId, panel],
  );
  // Reactive offline read so the observer workbench repaints (banner + freeze) on connection change.
  const isOffline = useHostRuntimeConnectionStatus(serverId) !== "online";

  return (
    <Workbench
      workbench={panel.workbench}
      controller={panel.controller}
      resolveEditorHandle={panel.resolveEditorHandle}
      isOffline={isOffline}
    />
  );
}
