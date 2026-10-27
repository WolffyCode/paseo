import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { withUnistyles } from "react-native-unistyles";
import { PASEO_LOGO_PATH, PASEO_LOGO_VIEW_BOX } from "@/components/icons/paseo-logo";
import { getIsElectron } from "@/constants/platform";
import { useDesktopEvent } from "@/desktop/electron/use-desktop-event";
import { getDesktopHost, type DesktopTaskManagerAppearance } from "@/desktop/host";
import { profileDisplayName, useBrowserProfileStore } from "../profile/store";
import { activateBrowserPage } from "../workspace-browsers";

type ColorScheme = DesktopTaskManagerAppearance["colorScheme"];

// What this window last told the task manager: its window is drawn by the desktop, in Helm's
// language and color scheme.
let currentAppearance: DesktopTaskManagerAppearance | null = null;

function taskManagerAppearance(input: {
  t: TFunction;
  locale: string;
  colorScheme: ColorScheme;
  profileName: string;
}): DesktopTaskManagerAppearance {
  const { t } = input;
  return {
    strings: {
      locale: input.locale,
      title: t("workspace.browser.taskManager.title"),
      categories: {
        tabsAndExtensions: t("workspace.browser.taskManager.categories.tabsAndExtensions"),
        browser: t("workspace.browser.taskManager.categories.browser"),
        all: t("workspace.browser.taskManager.categories.all"),
      },
      searchPlaceholder: t("workspace.browser.taskManager.searchPlaceholder"),
      searchAccessibleName: t("workspace.browser.taskManager.searchAccessibleName"),
      clearSearch: t("workspace.browser.taskManager.clearSearch"),
      endTask: t("workspace.browser.taskManager.endTask"),
      endTaskAccessibleName: t("workspace.browser.taskManager.endTaskAccessibleName"),
      tasksEnded: t("workspace.browser.taskManager.tasksEnded"),
      tasksNotEnded: t("workspace.browser.taskManager.tasksNotEnded"),
      columns: {
        task: t("workspace.browser.taskManager.columns.task"),
        profile: t("workspace.browser.taskManager.columns.profile"),
        memory: t("workspace.browser.taskManager.columns.memory"),
        cpu: t("workspace.browser.taskManager.columns.cpu"),
        network: t("workspace.browser.taskManager.columns.network"),
        processId: t("workspace.browser.taskManager.columns.processId"),
        idleWakeups: t("workspace.browser.taskManager.columns.idleWakeups"),
      },
      titles: {
        browser: t("workspace.browser.taskManager.rowTitles.browser"),
        gpu: t("workspace.browser.taskManager.rowTitles.gpu"),
        renderer: t("workspace.browser.taskManager.rowTitles.renderer"),
        utility: t("workspace.browser.taskManager.rowTitles.utility"),
        tab: t("workspace.browser.taskManager.rowTitles.tab"),
        subframe: t("workspace.browser.taskManager.rowTitles.subframe"),
        extension: t("workspace.browser.taskManager.rowTitles.extension"),
        serviceWorker: t("workspace.browser.taskManager.rowTitles.serviceWorker"),
      },
      notAvailable: t("workspace.browser.taskManager.notAvailable"),
      byteUnits: {
        bytes: t("workspace.browser.taskManager.byteUnits.bytes"),
        kilobytes: t("workspace.browser.taskManager.byteUnits.kilobytes"),
        megabytes: t("workspace.browser.taskManager.byteUnits.megabytes"),
        gigabytes: t("workspace.browser.taskManager.byteUnits.gigabytes"),
      },
      profileName: input.profileName,
    },
    colorScheme: input.colorScheme,
    productLogo: { viewBox: PASEO_LOGO_VIEW_BOX, d: PASEO_LOGO_PATH },
  };
}

function TaskManagerAppearanceSync({ colorScheme }: { colorScheme: ColorScheme }) {
  const { t, i18n } = useTranslation();
  const name = useBrowserProfileStore((state) => state.name);
  const profileName = profileDisplayName(name, t);
  useEffect(() => {
    const appearance = taskManagerAppearance({
      t,
      locale: i18n.language,
      colorScheme,
      profileName,
    });
    currentAppearance = appearance;
    void getDesktopHost()
      ?.browser?.taskManager?.setAppearance(appearance)
      .catch((error: unknown) => {
        console.error("[browser-task-manager] appearance sync failed", error);
      });
  }, [colorScheme, i18n.language, profileName, t]);
  return null;
}

const ThemedTaskManagerAppearanceSync = withUnistyles(TaskManagerAppearanceSync);
const colorSchemeMapping = (theme: { colorScheme: ColorScheme }) => ({
  colorScheme: theme.colorScheme,
});

/**
 * One app-level owner keeps activation and appearance in sync, including while settings or a
 * conversation without a browser is shown.
 */
export function BrowserTaskManagerSync() {
  useBrowserTaskManagerActivation();
  return getIsElectron() ? <ThemedTaskManagerAppearanceSync uniProps={colorSchemeMapping} /> : null;
}

/** Chrome's 任务管理器: opens its window, or brings it forward with `browserId`'s row selected. */
export async function openTaskManager(browserId: string | null): Promise<void> {
  const appearance = currentAppearance;
  const taskManager = getDesktopHost()?.browser?.taskManager;
  if (!appearance || !taskManager) throw new Error("Browser task manager is unavailable");
  await taskManager.open({ browserId, appearance });
}

/** Double-click or Return on a task-manager row opens the page's owning workspace. */
function useBrowserTaskManagerActivation(): void {
  useDesktopEvent<unknown>("browser-task-manager-activate", (payload) => {
    if (typeof payload !== "object" || payload === null || !("browserId" in payload)) return;
    if (typeof payload.browserId === "string") activateBrowserPage(payload.browserId);
  });
}
