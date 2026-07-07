// Reveal-in-Finder thin wrapper, self-contained (standards §8): reaches the Electron preload editor
// bridge through the platform gate (@/constants/platform) + the preload global directly, rather than
// importing the legacy desktop/host module. The bridge itself is a preload capability, not an old app
// feature module, so touching it here is allowed; non-desktop runtimes no-op (the menu item is already
// disabled off-desktop via the isElectron gate). This is the port the store's revealInFinder action
// writes through with an absolute host path.

import { getIsElectron, isWeb } from "@/constants/platform";

// Minimal local view of the Electron preload editor bridge (mode "reveal" locates the path in the OS
// file manager). Declared here so this file needs no import from desktop/host.
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

/** Reveal an absolute host path in the OS file manager (Finder). No-op off desktop. */
export function revealInFinder(path: string): void {
  if (!isWeb || !getIsElectron()) {
    return;
  }
  const host = (window as unknown as { paseoDesktop?: PreloadEditorHost }).paseoDesktop;
  const openTarget = host?.editor?.openTarget;
  if (typeof openTarget !== "function") {
    return;
  }
  void openTarget({ editorId: "finder", path, mode: "reveal" }).catch(() => undefined);
}
