// Right-tab bridge (联动2) — the SINGLE seam from the file tree onto the right panel. The tree produces
// "open this file location in the right tab"; this bridge ensures the right region is visible + hands the
// location to the new-shell right panel (via the per-workspace panel registry, wired in
// right-tab-bridge.wiring.ts). De-dup / focus / autosave all live in the right panel's WorkbenchModel —
// the bridge only forwards.
//
// This file is the PURE half: the factory + contract, with ZERO old-module imports, so the unit test
// exercises the wiring logic with injected fakes. The concrete binding onto shellModel.openRight + the
// registry lives in right-tab-bridge.wiring.ts (the registered seam, loaded only at runtime by the shell).
//
// Future switch point: when the right panel replaces this routing entirely, change only the wiring —
// callers (the store) keep calling openFileInRightTab unchanged.

// A file location to open in the right tab. Structurally matches the right panel's FileLocation but is
// declared here so the pure half carries no cross-module import; the wiring forwards it as-is.
export interface FileLocation {
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

// The minimal surface the bridge depends on, injected so it is testable with fakes: expand the right
// region, and open a file location in a workspace's right panel.
export interface RightTabBridgeDeps {
  // Ensure the shell's right region is visible (mounts the panel if it was collapsed).
  openRight(): void;
  // Open a file location in the given workspace's right panel (queued if the region hasn't mounted yet).
  openFile(input: { serverId: string; workspaceId: string; location: FileLocation }): void;
}

// The bridge's public surface: the one action the tree calls to surface a file in the right tab.
export interface RightTabBridge {
  // Open `location` as a focused right-side file tab; ensure the right region is visible. With no valid
  // workspace context (§7 degrade), silently no-op: the file was already created + refreshed onto the
  // tree, and "open tab" is an increment, never a precondition.
  openFileInRightTab(input: {
    location: FileLocation;
    workspaceId: string;
    serverId: string;
  }): void;
}

// Build the bridge over injected deps. A factory (not a class) since it holds no state.
export function createRightTabBridge(deps: RightTabBridgeDeps): RightTabBridge {
  return {
    openFileInRightTab({ location, workspaceId, serverId }) {
      if (!serverId || !workspaceId) {
        return;
      }
      deps.openRight();
      deps.openFile({ serverId, workspaceId, location });
    },
  };
}
