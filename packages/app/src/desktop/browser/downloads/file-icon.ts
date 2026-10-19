import { useEffect, useState } from "react";
import { getDesktopHost, type DesktopBrowserDownload } from "@/desktop/host";

// Finder icons by download, kept for the session as Chrome's IconManager keeps them.
const fileIconUrls = new Map<string, string>();

/** The Finder icon of a finished file, or null while there is none. */
export function useFileIcon(download: DesktopBrowserDownload): string | null {
  const isOnDisk = download.state === "complete" && !download.isFileMissing;
  const [iconUrl, setIconUrl] = useState(() => fileIconUrls.get(download.id) ?? null);
  useEffect(() => {
    const downloadsBridge = getDesktopHost()?.browser?.downloads;
    if (!isOnDisk || fileIconUrls.has(download.id) || !downloadsBridge) {
      return;
    }
    let isCurrent = true;
    void downloadsBridge
      .fileIcon(download.id)
      .then((url) => {
        if (url) {
          fileIconUrls.set(download.id, url);
        }
        if (isCurrent) {
          setIconUrl(url);
        }
        return undefined;
      })
      .catch((error: unknown) => {
        // The row keeps Chrome's generic file icon.
        console.warn("[browser-downloads] file icon failed", error);
      });
    return () => {
      isCurrent = false;
    };
  }, [download.id, isOnDisk]);
  return isOnDisk ? iconUrl : null;
}
