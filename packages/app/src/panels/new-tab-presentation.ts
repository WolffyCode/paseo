import { workbenchPaneHost } from "@/workbench/layout";

export interface NewTabPresentation {
  labelKey: "workspace.home.title" | "workspace.tabs.actions.newTab";
  icon: "home" | "plus";
}

const HOME_PRESENTATION: NewTabPresentation = { labelKey: "workspace.home.title", icon: "home" };
const PLAIN_NEW_TAB_PRESENTATION: NewTabPresentation = {
  labelKey: "workspace.tabs.actions.newTab",
  icon: "plus",
};

/** In column 3 a new tab is that column's home page; every other pane keeps the plain launcher. */
export function newTabPresentation(paneId: string | null): NewTabPresentation {
  if (workbenchPaneHost(paneId) === "content") return HOME_PRESENTATION;
  return PLAIN_NEW_TAB_PRESENTATION;
}
