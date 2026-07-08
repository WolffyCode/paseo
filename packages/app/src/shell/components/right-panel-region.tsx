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

  // Panel-level aggregate state (architecture §3.5, requirement sRS9) is derived HERE, not in the models.
  // Of the five sRS9 states, two are live and three are structurally N/A in this architecture:
  //   • 空  = the launcher (no open tabs) — Workbench renders it off `workbench.mode`.
  //   • 离线 = derived below and threaded to the observer Workbench (top reconnect banner + frozen content).
  //   • 加载 / 错误 = N/A: the panel is created synchronously (createRightPanelForServer just constructs a
  //     WorkbenchModel — there is no async host handshake that could be pending or fail), so there is no
  //     panel-build spinner or panel-build error to show.
  //   • 能力门「更新主机以使用工作面板」/「查看如何更新」 = N/A as a panel takeover: file READ has no
  //     capability flag (architecture §5 — it rides the always-present file-explorer channel), so no host
  //     capability can be absent to make the whole panel unusable. The ONE gated capability — content
  //     WRITE (features.fsWriteFile) — is file-level: a file stays viewable read-only and shows its own
  //     "更新主机" hint (see file-document-model readOnlyReason / file-tab-view CapabilityHint), never a
  //     panel-wide block (a takeover here would wrongly hide viewable files, violating requirement §5).
  //     A live panel takeover would need a NEW host "workbench" capability flag — an architect decision,
  //     out of this UI fix's scope; flagged rather than wired as a never-true (dead) gate.
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
