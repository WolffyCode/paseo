import type { TFunction } from "i18next";
import {
  getDesktopHost,
  type DesktopBrowserDownload,
  type DesktopNativeMenuItem,
} from "@/desktop/host";

const MENU_CHOICES = [
  "openWhenDone",
  "alwaysOpenType",
  "pause",
  "resume",
  "show",
  "cancel",
  "open",
] as const;
type DownloadMenuChoice = (typeof MENU_CHOICES)[number];
const CHOICES = new Set<string>(MENU_CHOICES);

function isDownloadMenuChoice(value: string): value is DownloadMenuChoice {
  return CHOICES.has(value);
}

/** Chrome's download context menu for one state (download_ui_context_menu.cc). */
function menuItems(download: DesktopBrowserDownload, t: TFunction): DesktopNativeMenuItem[] {
  const label = (key: string) => t(`workspace.browser.downloads.menu.${key}`);
  const alwaysOpenItem: DesktopNativeMenuItem = {
    id: "alwaysOpenType",
    label: label("alwaysOpenType"),
    kind: "checkbox",
    isChecked: download.opensTypeAutomatically,
    isEnabled: download.canOpenTypeAutomatically,
  };
  const separator: DesktopNativeMenuItem = { kind: "separator" };
  if (download.state === "in_progress") {
    return [
      {
        id: "openWhenDone",
        label: label("openWhenDone"),
        kind: "checkbox",
        isChecked: download.openWhenDone,
      },
      alwaysOpenItem,
      separator,
      download.isPaused
        ? { id: "resume", label: label("resume") }
        : { id: "pause", label: label("pause") },
      { id: "show", label: label("show") },
      separator,
      { id: "cancel", label: label("cancel") },
    ];
  }
  if (download.state === "complete") {
    // Once the file is gone, Chrome can neither open nor show it.
    const isOnDisk = !download.isFileMissing;
    return [
      { id: "open", label: label("open"), isEnabled: isOnDisk },
      alwaysOpenItem,
      separator,
      { id: "show", label: label("show"), isEnabled: isOnDisk },
      separator,
      { id: "cancel", label: label("cancel"), isEnabled: false },
    ];
  }
  return [
    { id: "resume", label: label("resume"), isEnabled: download.canResume },
    separator,
    { id: "cancel", label: label("cancel"), isEnabled: false },
  ];
}

/** Shows the row's context menu at the pointer and runs the chosen command. */
export async function showDownloadMenu(input: {
  download: DesktopBrowserDownload;
  t: TFunction;
}): Promise<void> {
  const host = getDesktopHost();
  const popup = host?.menu?.popup;
  const downloads = host?.browser?.downloads;
  if (!popup || !downloads) {
    return;
  }
  const { download } = input;
  const chosen = await popup({ items: menuItems(download, input.t) });
  if (chosen === null || !isDownloadMenuChoice(chosen)) {
    return;
  }
  const commands: Record<DownloadMenuChoice, () => Promise<void>> = {
    openWhenDone: () => downloads.setOpenWhenDone(download.id, !download.openWhenDone),
    alwaysOpenType: () =>
      downloads.setOpensTypeAutomatically(download.id, !download.opensTypeAutomatically),
    pause: () => downloads.pause(download.id),
    resume: () => downloads.resume(download.id),
    show: () => downloads.showInFolder(download.id),
    cancel: () => downloads.cancel(download.id),
    open: () => downloads.open(download.id),
  };
  await commands[chosen]();
}
