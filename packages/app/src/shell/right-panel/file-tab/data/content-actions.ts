// The imperative ports the content-area right-click menu writes through, self-contained in the new
// directory (standards §8): clipboard on the shared expo-clipboard package, reveal-in-finder on the
// Electron preload bridge reached via the platform gate, and the browser's own edit commands for the
// focused editor. No legacy copy/reveal helper is imported. Desktop/web only; non-web runtimes no-op
// (the panel is desktop-only).

import * as Clipboard from "expo-clipboard";
import { getIsElectron, isWeb } from "@/constants/platform";

// Write text to the OS clipboard (fire-and-forget — the menu never awaits it).
export function copyTextToClipboard(text: string): void {
  void Clipboard.setStringAsync(text);
}

// Minimal local view of the Electron preload editor bridge (mode "reveal" locates the path in the OS file
// manager). Declared here so this file needs no import from the desktop/host module.
interface PreloadEditorHost {
  editor?: {
    openTarget?: (input: {
      editorId: string;
      path: string;
      cwd?: string;
      mode?: "open" | "reveal";
    }) => Promise<void>;
  };
}

// Reveal an absolute host path in the OS file manager (Finder). No-op off desktop.
export function revealInFinder(absPath: string): void {
  if (!isWeb || !getIsElectron()) {
    return;
  }
  const host = (window as unknown as { paseoDesktop?: PreloadEditorHost }).paseoDesktop;
  const openTarget = host?.editor?.openTarget;
  if (typeof openTarget !== "function") {
    return;
  }
  void openTarget({ editorId: "finder", path: absPath, mode: "reveal" }).catch(() => undefined);
}

// Best-effort copy of an image (from its data URI) to the OS clipboard via the async Clipboard API. The
// menu item stays useful where the browser supports image clipboard writes and is a silent no-op where it
// doesn't (older engines / permissions) — never throwing into the menu dispatch. No-op off web.
export function copyImageDataUri(dataUri: string): void {
  if (!isWeb || typeof navigator === "undefined" || !dataUri) {
    return;
  }
  const clipboard = navigator.clipboard as
    | { write?: (items: unknown[]) => Promise<void> }
    | undefined;
  const ClipboardItemCtor = (
    globalThis as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }
  ).ClipboardItem;
  if (!clipboard?.write || !ClipboardItemCtor || typeof fetch === "undefined") {
    return;
  }
  void fetch(dataUri)
    .then((response) => response.blob())
    .then((blob) => clipboard.write?.([new ClipboardItemCtor({ [blob.type]: blob })]))
    .catch(() => undefined);
}

// Run a browser edit command against the currently-focused editor (the CodeMirror contenteditable), used
// by the right-click menu's cut/copy/paste/select-all/copy-selection items. The keyboard shortcuts route
// through CodeMirror's own keymap; this is the supplementary right-click channel. No-op off web.
export function execEditorCommand(command: "cut" | "copy" | "paste" | "selectAll"): void {
  if (!isWeb || typeof document === "undefined") {
    return;
  }
  try {
    document.execCommand(command);
  } catch {
    // execCommand is best-effort (some browsers gate clipboard commands); a failure is a silent no-op.
  }
}
