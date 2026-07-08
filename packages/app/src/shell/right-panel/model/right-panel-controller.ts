// RightPanelController — the right panel's single outward entry point, replacing the legacy
// workspace-layout-store.openTabFocused. It is a small ORCHESTRATOR (not a read-only narrowing like
// FileTreeController): openFile composes "ensure the right column is expanded" + "open the file tab",
// so a collapsed panel opens correctly. Every file-open source (tree click, conversation doc address,
// output local link, launcher) funnels through here.

import type { FileLocation } from "./file-location";
import type { TabKind } from "./tab-content";
import type { WorkbenchModel } from "./workbench-model";

export interface RightPanelController {
  openFile(location: FileLocation): void;
  openLauncherType(kind: TabKind): void;
}

// What the controller composes: the workbench (tab set) and the shell's "ensure right open" action. The
// controller carries no state itself — it just sequences these two.
export interface RightPanelControllerDeps {
  readonly workbench: WorkbenchModel;
  readonly openRight: () => void;
}

// Build the controller over its deps.
export function createRightPanelController(deps: RightPanelControllerDeps): RightPanelController {
  return {
    // Expand the right column FIRST, then open/focus the file tab, so the tab lands in a visible panel.
    openFile(location: FileLocation): void {
      deps.openRight();
      deps.workbench.openTab({ kind: "file", location });
    },
    // Launcher / new-tab dropdown entry — delegated to the workbench (usability policy lives there).
    openLauncherType(kind: TabKind): void {
      deps.workbench.openLauncherType(kind);
    },
  };
}
