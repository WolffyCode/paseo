// The per-workspace panel registry — the tiny shared seam that connects the two shell mount points that
// can't import each other's mount: the file tree (which produces "open this file in the right tab" +
// answers tree reveal) and the right panel (which owns the tab workbench). Keyed by `${serverId}:
// ${workspaceId}`, it holds each side's access face so the right-tab bridge (a module singleton) reaches
// the right panel, and the right panel's tab factory reaches the file tree for root + reveal — without a
// direct dependency between the two regions. A pending-open queue covers the collapsed-panel case: an
// open requested before the right region mounts is drained onto the target the moment it registers.

import type { FileLocation } from "../model/file-location";

// The right panel's inward face (satisfied by RightPanelController): open a file location in its tabs.
export interface RightPanelTarget {
  openFile(location: FileLocation): void;
}

// The file tree's inward face (satisfied by FileTreeController): its current root (the cwd file paths are
// relative to) + the tree-reveal command. Used by the tab factory to root a document + drive reveal.
export interface FileTreeAccess {
  readonly rootPath: string | null;
  revealFile(absPath: string): void;
}

interface Entry {
  target: RightPanelTarget | null;
  fileTree: FileTreeAccess | null;
  pending: FileLocation[];
}

const registry = new Map<string, Entry>();

function keyOf(serverId: string, workspaceId: string): string {
  return `${serverId}:${workspaceId}`;
}

// Get the workspace's entry, creating an empty one on first touch.
function entryOf(key: string): Entry {
  let entry = registry.get(key);
  if (!entry) {
    entry = { target: null, fileTree: null, pending: [] };
    registry.set(key, entry);
  }
  return entry;
}

// Drop an entry once both faces are gone and nothing is queued, so revisited workspaces don't accumulate.
function pruneIfEmpty(key: string, entry: Entry): void {
  if (!entry.target && !entry.fileTree && entry.pending.length === 0) {
    registry.delete(key);
  }
}

// Open a file location in a workspace's right panel: straight to the target if the region is mounted, else
// queued until it registers (a collapsed panel that the bridge is about to expand).
export function openFileInPanel(
  serverId: string,
  workspaceId: string,
  location: FileLocation,
): void {
  const entry = entryOf(keyOf(serverId, workspaceId));
  if (entry.target) {
    entry.target.openFile(location);
  } else {
    entry.pending.push(location);
  }
}

// Register the right panel's controller for a workspace (on region mount), draining any queued opens onto
// it. Returns an unregister to call on unmount.
export function registerRightPanelTarget(
  serverId: string,
  workspaceId: string,
  target: RightPanelTarget,
): () => void {
  const key = keyOf(serverId, workspaceId);
  const entry = entryOf(key);
  entry.target = target;
  if (entry.pending.length > 0) {
    const queued = entry.pending;
    entry.pending = [];
    for (const location of queued) {
      target.openFile(location);
    }
  }
  return () => {
    const current = registry.get(key);
    if (current?.target === target) {
      current.target = null;
      pruneIfEmpty(key, current);
    }
  };
}

// Register the file tree's access for a workspace (on region mount). Returns an unregister for unmount.
export function registerFileTreeAccess(
  serverId: string,
  workspaceId: string,
  fileTree: FileTreeAccess,
): () => void {
  const key = keyOf(serverId, workspaceId);
  const entry = entryOf(key);
  entry.fileTree = fileTree;
  return () => {
    const current = registry.get(key);
    if (current?.fileTree === fileTree) {
      current.fileTree = null;
      pruneIfEmpty(key, current);
    }
  };
}

// Resolve the file tree's access for a workspace (null when its region isn't mounted).
export function resolveFileTreeAccess(
  serverId: string,
  workspaceId: string,
): FileTreeAccess | null {
  return registry.get(keyOf(serverId, workspaceId))?.fileTree ?? null;
}
