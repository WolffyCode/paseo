// Public capability face of the file tree (hard requirement 5 / architecture §8.2). FileTreeController
// narrows the store to a read-only + single-action view: "feed a directory root → show it", plus the
// current root and selection as read-only deriveds. This is the ONLY reuse surface external callers
// (conversation-side "pick directory" / "open this directory" later) touch — they never reach into the
// store's internal state machines. YAGNI: no event bus / subscription / multi-root management is
// predefined; only this one face for "accept an external directory input".

import type { FileTreeStore } from "./file-tree-store";

// The narrowed outward contract. The store is its implementation body; callers depend on this shape.
export interface FileTreeController {
  // Feed a directory root → re-root the tree at it (clearing expanded/selected/search). Sole entry for
  // external "show this directory". Fire-and-forget from the caller's view (listing happens async).
  showDirectory(rootPath: string): void;
  // The current root (absolute host path), read-only.
  readonly rootPath: string | null;
  // The current selection (root-relative path), read-only — for the right-side file tab to consume later.
  readonly selectedPath: string | null;
}

// Narrow a store instance to its public controller face. The store already implements every member; this
// just fixes the outward type so callers can't reach internal actions/state.
export function asFileTreeController(store: FileTreeStore): FileTreeController {
  return store;
}
