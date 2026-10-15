import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { createWorkbenchModel } from "./model";
import {
  buildNewWorkspaceRoute,
  buildSettingsAddHostRoute,
  buildSettingsHostRoute,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { usePanelStore } from "@/stores/panel-store";

const STORAGE_KEY = "workbench-preferences";

export const workbenchModel = createWorkbenchModel({
  getNavigationWidth: () => usePanelStore.getState().sidebarWidth,
  saveNavigationWidth: (width) => usePanelStore.getState().setSidebarWidth(width),
  subscribeNavigation: (listener) => usePanelStore.subscribe(listener),
  async readPreferences() {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return {};
    return JSON.parse(saved);
  },
  async savePreferences(preferences) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  },
  navigate(path) {
    const workspace = parseHostWorkspaceRouteFromPathname(path);
    if (workspace) navigateToWorkspace(workspace);
    else if (path === "/settings") router.navigate("/settings");
    else if (path === "/schedules") router.navigate("/schedules");
    else if (path === "/open-project") router.navigate("/open-project");
    else {
      const params = new URLSearchParams(path.split("?")[1]);
      router.navigate(
        buildNewWorkspaceRoute({
          serverId: params.get("serverId") ?? undefined,
          draftId: params.get("draftId") ?? undefined,
          sourceDirectory: params.get("dir") ?? undefined,
          displayName: params.get("name") ?? undefined,
          projectId: params.get("projectId") ?? undefined,
        }),
      );
    }
  },
  selectHost(serverId) {
    router.navigate({ pathname: "/h/[serverId]", params: { serverId } });
  },
  addHost() {
    router.navigate(buildSettingsAddHostRoute(Date.now()));
  },
  openHostSettings(serverId) {
    router.navigate(buildSettingsHostRoute(serverId));
  },
});
