// Native directory-picker thin wrapper, self-contained (standards §8): rewritten to reach the
// Electron dialog through the platform gate (@/constants/platform) + the preload global directly,
// rather than importing the legacy desktop/host module. Non-desktop runtimes return null (the
// "切换目录" affordance is desktop-only); a user cancel also returns null (the cancel fork in sFT7).

import { getIsElectron, isWeb } from "@/constants/platform";

// Minimal local view of the Electron preload dialog (the preload global is a platform capability,
// not an old app module). Declared here so this file needs no import from desktop/host.
interface PreloadDialogHost {
  dialog?: {
    open?: (options?: {
      directory?: boolean;
      multiple?: boolean;
    }) => Promise<string | string[] | null>;
  };
}

/** Open the OS directory picker and resolve the chosen path, or null on cancel / non-desktop. */
export async function pickDirectory(): Promise<string | null> {
  if (!isWeb || !getIsElectron()) {
    return null;
  }

  const host = (window as unknown as { paseoDesktop?: PreloadDialogHost }).paseoDesktop;
  const open = host?.dialog?.open;
  if (typeof open !== "function") {
    return null;
  }

  const selection = await open({ directory: true, multiple: false });
  if (typeof selection === "string") {
    return selection;
  }
  return null;
}
