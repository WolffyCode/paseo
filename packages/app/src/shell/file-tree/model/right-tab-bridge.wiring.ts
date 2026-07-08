// Right-tab bridge wiring — the concrete half of the right-tab seam (standards §8 4.C / §9 ③). It binds
// the pure right-tab-bridge factory to the NEW shell: shellModel.openRight() to expand the region, and
// the per-workspace panel registry to open the file into the right panel's WorkbenchModel. Loaded at
// runtime by the shell, never by the bridge's unit test (which exercises the pure factory).
//
// This no longer touches the old workspace-layout / workspace-tabs stores — de-dup / focus / autosave now
// live in the right panel's WorkbenchModel + FileDocumentModel. The boundary is thin: the tree's
// structured location flows straight through to openFileInPanel (both sides share the same shape).
//
// Future switch point: when the right panel owns the tree→panel routing directly, change only this file —
// callers keep calling rightTabBridge.openFileInRightTab.

import { shellModel } from "../../model/shell-model";
import { openFileInPanel } from "../../right-panel/data/workspace-panels";
import { createRightTabBridge, type RightTabBridge } from "./right-tab-bridge";

// The production right-tab bridge, bound to the new shell's openRight + the per-workspace panel registry.
export const rightTabBridge: RightTabBridge = createRightTabBridge({
  openRight: () => shellModel.openRight(),
  openFile: ({ serverId, workspaceId, location }) =>
    openFileInPanel(serverId, workspaceId, location),
});
