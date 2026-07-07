// Clipboard state transitions for cut/copy/paste, pure (standards §8.8). The store holds the
// clipboard; this module owns the transition logic so paste semantics (cut clears, copy stays)
// and the paste-enabled rule are verifiable without a store instance.

import type { Clipboard } from "./types";

/** Mark a path for moving; paste will relocate it and then clear the clipboard. */
export function setCut(path: string): Clipboard {
  return { mode: "cut", path };
}

/** Mark a path for copying; paste will duplicate it and keep the clipboard for repeat pastes. */
export function setCopy(path: string): Clipboard {
  return { mode: "copy", path };
}

/** Empty the clipboard. */
export function clearClipboard(): null {
  return null;
}

/** Next clipboard after a paste: cut is consumed (null), copy persists for further pastes. */
export function afterPaste(clipboard: Clipboard): Clipboard | null {
  return clipboard.mode === "cut" ? null : clipboard;
}

/** Whether paste is available — true exactly when the clipboard holds an entry. */
export function canPaste(clipboard: Clipboard | null): boolean {
  return clipboard !== null;
}
