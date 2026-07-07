// Right-tab bridge (联动2) — the SINGLE seam from the file tree onto the old workspace-layout store
// (standards §8 4.C / §9 ③: one of only two seams in this directory allowed to touch old feature
// modules). The tree produces "open this file location in the right tab"; this bridge translates that
// into the old layout store's openTabFocused (which auto-creates the right tools pane, focuses, and
// un-collapses) + the shell's own openRight(). De-dup is NOT re-implemented here — openTabFocused
// routes through the existing applyEnsureTab/workspaceTabTargetsEqual (file tab id = file_${path}), so
// re-opening the same path focuses the existing tab instead of stacking a duplicate.
//
// This file is the PURE half: the factory + contract, with ZERO old-module imports, so the unit test
// exercises the wiring logic without loading the old layout/tabs stores. The concrete binding onto the
// real stores + new shell lives in right-tab-bridge.wiring.ts (the registered seam, loaded only at
// runtime by the shell). Together the two files are the one right-tab seam.
//
// Future switch point: when the old workspace-layout store is rebuilt into the new shell, change only
// the wiring (right-tab-bridge.wiring.ts) — callers (the store) keep calling openFileInRightTab.

// A file location to open in the right tab. Structurally matches the old WorkspaceFileLocation but is
// declared here so the pure half carries no old import; the wiring adapts it to the old type (identical).
export interface FileLocation {
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

// The minimal old-module surface the bridge depends on, injected so the wiring is testable with fakes
// and the real bindings stay in right-tab-bridge.wiring.ts. The target type is opaque here (T) — the
// factory only forwards it from createFileTabTarget into openTabFocused, so it needn't know its shape.
export interface RightTabBridgeDeps<T = unknown> {
  // Compose the workspace tab persistence key; returns null when serverId/workspaceId is missing.
  buildPersistenceKey(input: { serverId: string; workspaceId: string }): string | null;
  // Build the right-tab file target the layout store opens, from the location.
  createFileTabTarget(location: FileLocation): T;
  // Open + focus a tab under the key (auto-creates/un-collapses the right tools pane; dedups by path).
  openTabFocused(persistenceKey: string, target: T): string | null;
  // Ensure the shell's right region is visible (a second truth source from the layout's collapse flag).
  openRight(): void;
}

// The bridge's public surface: the one action the tree calls to surface a file in the right tab.
export interface RightTabBridge {
  // Open `location` as a focused right-side file tab; ensure the right region is visible. When the
  // persistence key can't be built (no valid workspaceId — §7 degrade), silently no-op: the file was
  // already created + refreshed onto the tree, and "open tab" is an increment, never a precondition.
  openFileInRightTab(input: {
    location: FileLocation;
    workspaceId: string;
    serverId: string;
  }): void;
}

// Build the bridge over injected deps. A factory (not a class) since it holds no state.
export function createRightTabBridge<T>(deps: RightTabBridgeDeps<T>): RightTabBridge {
  return {
    openFileInRightTab({ location, workspaceId, serverId }) {
      const persistenceKey = deps.buildPersistenceKey({ serverId, workspaceId });
      if (!persistenceKey) {
        return;
      }
      deps.openTabFocused(persistenceKey, deps.createFileTabTarget(location));
      deps.openRight();
    },
  };
}
