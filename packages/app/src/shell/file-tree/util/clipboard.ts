// System-clipboard thin wrapper, self-contained (standards §8): rewritten directly on the
// expo-clipboard package (an allowed shared dependency) so the new directory imports no legacy
// copy-to-clipboard helper. This is the port the store's copyPath action writes through; the
// decision of what text to copy (absolute vs relative) lives in the tested util/tree-paths.ts.

import * as Clipboard from "expo-clipboard";

/** Write text to the OS clipboard. */
export async function copyTextToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
