import { useCallback, useEffect, useState } from "react";
import { getDesktopHost, type DesktopBrowserDownloadSettings } from "@/desktop/host";

function reportFailure(action: string) {
  return (error: unknown) => {
    // The page keeps showing the last settings it read; the next change retries.
    console.error(`[browser-downloads] ${action} failed`, error);
  };
}

type DownloadToggle = "promptForDownload" | "partialViewEnabled";

/**
 * The download preferences the main process keeps, for settings' 下载内容 page: null until read.
 */
export function useDownloadSettings(): {
  settings: DesktopBrowserDownloadSettings | null;
  chooseDirectory: () => void;
  setToggle: (toggle: DownloadToggle, isOn: boolean) => void;
} {
  const [settings, setSettings] = useState<DesktopBrowserDownloadSettings | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void getDesktopHost()
      ?.browser?.downloads?.settings()
      .then((read) => {
        if (isCurrent) setSettings(read);
        return undefined;
      })
      .catch(reportFailure("reading download settings"));
    return () => {
      isCurrent = false;
    };
  }, []);

  const chooseDirectory = useCallback(() => {
    void getDesktopHost()
      ?.browser?.downloads?.chooseDirectory()
      .then((chosen) => {
        setSettings(chosen);
        return undefined;
      })
      .catch(reportFailure("choosing the download folder"));
  }, []);

  const setToggle = useCallback((toggle: DownloadToggle, isOn: boolean) => {
    const downloads = getDesktopHost()?.browser?.downloads;
    if (!downloads) return;
    setSettings((current) => (current ? { ...current, [toggle]: isOn } : current));
    const save =
      toggle === "promptForDownload"
        ? downloads.setPromptForDownload(isOn)
        : downloads.setPartialViewEnabled(isOn);
    void save
      .then((saved) => {
        setSettings(saved);
        return undefined;
      })
      .catch(reportFailure(`saving ${toggle}`));
  }, []);

  return { settings, chooseDirectory, setToggle };
}
