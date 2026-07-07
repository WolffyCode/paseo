// Right-tab bridge wiring — the concrete half of the right-tab seam (standards §8 4.C / §9 ③). It binds
// the pure right-tab-bridge factory to the real old workspace-tabs/layout stores + the new shell, and
// is the ONLY file in this directory that imports those old workspace modules. Loaded at runtime by the
// shell, never by the bridge's unit test (which exercises the pure factory in right-tab-bridge.ts).
//
// De-dup is the existing applyEnsureTab/workspaceTabTargetsEqual (file tab id = file_${path}); this
// wiring does not re-implement it. shellModel.openRight() is the NEW shell's own action (not a seam).
//
// Future switch point: when the old workspace-layout store is rebuilt into the new shell, change only
// this wiring — callers keep calling rightTabBridge.openFileInRightTab.

import { buildWorkspaceTabPersistenceKey } from "@/stores/workspace-tabs-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { createWorkspaceFileTabTarget } from "@/workspace/file-open";
import { shellModel } from "../../model/shell-model";
import { createRightTabBridge, type RightTabBridge } from "./right-tab-bridge";

// The production right-tab bridge, bound to the real stores + the new shell's openRight.
export const rightTabBridge: RightTabBridge = createRightTabBridge({
  buildPersistenceKey: buildWorkspaceTabPersistenceKey,
  createFileTabTarget: (location) => createWorkspaceFileTabTarget(location),
  openTabFocused: (persistenceKey, target) =>
    useWorkspaceLayoutStore.getState().openTabFocused(persistenceKey, target),
  openRight: () => shellModel.openRight(),
});
