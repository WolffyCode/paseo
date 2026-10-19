import { z } from "zod";

export const WorkbenchPreferencesSchema = z.object({
  contentWidth: z.number().min(300).max(1600).optional(),
  filesWidth: z.number().min(160).max(600).default(190),
  contentVisible: z.boolean().default(true),
  filesVisible: z.boolean().default(true),
});
export type WorkbenchPreferences = z.infer<typeof WorkbenchPreferencesSchema>;
export type WorkbenchActivity = "home" | "schedules" | "settings";
export type WorkbenchBoundary = "navigation" | "content" | "files";

interface ResizeSession {
  boundary: WorkbenchBoundary;
  start: number;
  contentWidth: number;
  filesWidth: number;
  navigationWidth: number;
  initialNavigationWidth: number;
  preferences: WorkbenchPreferences;
  pendingPreferences: Partial<WorkbenchPreferences>;
}

export interface WorkbenchSnapshot {
  activity: WorkbenchActivity;
  hostPickerOpen: boolean;
  preferences: WorkbenchPreferences;
  viewport: number;
  windowWidth: number;
  navigationWidth: number;
  contentWidth: number;
  mainWidth: number;
  filesWidth: number;
  contentMaximized: boolean;
  workspaceActionsVisible: boolean;
  resizing: boolean;
  hydrated: boolean;
  persistenceError: string | null;
  reducedTransparency: boolean;
}

export interface WorkbenchServices {
  readPreferences(): Promise<unknown>;
  savePreferences(preferences: WorkbenchPreferences): Promise<void>;
  navigate(path: string): void;
  selectHost(serverId: string): void;
  addHost(): void;
  openHostSettings(serverId: string): void;
  getNavigationWidth(): number;
  saveNavigationWidth(width: number): void;
  subscribeNavigation(listener: () => void): () => void;
}

export function createWorkbenchModel(services: WorkbenchServices) {
  let preferences = WorkbenchPreferencesSchema.parse({});
  let homePath = "/new";
  let resize: ResizeSession | null = null;
  let disposed = false;
  let pendingPreferences: Partial<WorkbenchPreferences> = {};
  let pendingSave = false;
  const initializedDrafts = new Set<string>();
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  let state: WorkbenchSnapshot = {
    activity: "home",
    hostPickerOpen: false,
    preferences,
    viewport: 0,
    windowWidth: 0,
    navigationWidth: services.getNavigationWidth(),
    contentWidth: 0,
    mainWidth: 0,
    filesWidth: 0,
    contentMaximized: false,
    workspaceActionsVisible: false,
    resizing: false,
    hydrated: false,
    persistenceError: null,
    reducedTransparency: false,
  };

  function publish(patch: Partial<WorkbenchSnapshot> = {}) {
    if (disposed) return;
    const next = { ...state, ...patch, preferences, resizing: resize !== null };
    next.navigationWidth = Math.min(
      resize?.navigationWidth ?? services.getNavigationWidth(),
      Math.max(200, next.windowWidth - 660),
    );
    const home = next.activity === "home";
    const maximized = home && next.contentMaximized;
    const showContent = home && preferences.contentVisible && next.viewport >= 606;
    const contentMinimum = showContent ? 306 : 0;
    const showFiles =
      home && preferences.filesVisible && next.viewport >= 466 + contentMinimum && !maximized;
    next.filesWidth = showFiles
      ? Math.min(preferences.filesWidth, Math.max(160, next.viewport - 306 - contentMinimum))
      : 0;
    next.contentWidth = showContent
      ? Math.min(
          preferences.contentWidth ?? (next.viewport - next.filesWidth - 16) * 0.47,
          Math.max(300, next.viewport - next.filesWidth - 316),
        )
      : 0;
    if (maximized) next.contentWidth = next.viewport;
    next.mainWidth = maximized
      ? 0
      : Math.max(
          0,
          next.viewport -
            next.contentWidth -
            next.filesWidth -
            (next.contentWidth ? 8 : 0) -
            (next.filesWidth ? 8 : 0),
        );
    state = next;
    for (const listener of listeners) listener();
  }

  const unsubscribeNavigation = services.subscribeNavigation(() => publish());

  function updatePreferences(patch: Partial<WorkbenchPreferences>) {
    preferences = { ...preferences, ...patch };
    if (!state.hydrated) pendingPreferences = { ...pendingPreferences, ...patch };
  }

  function persist() {
    if (!state.hydrated) {
      pendingSave = true;
      return;
    }
    const saved = preferences;
    writes = writes
      .then(() => services.savePreferences(saved))
      .then(
        () => publish({ persistenceError: null }),
        (error: unknown) =>
          publish({
            persistenceError: error instanceof Error ? error.message : "Unable to save layout",
          }),
      );
  }

  void services.readPreferences().then(
    (value) => {
      const parsed = WorkbenchPreferencesSchema.safeParse(value);
      const saved = parsed.success ? parsed.data : WorkbenchPreferencesSchema.parse({});
      preferences = { ...saved, ...pendingPreferences };
      if (resize) resize.preferences = { ...saved, ...resize.pendingPreferences };
      pendingPreferences = {};
      publish({ hydrated: true });
      if (pendingSave) {
        pendingSave = false;
        persist();
      }
      return undefined;
    },
    (error: unknown) =>
      publish({
        hydrated: true,
        persistenceError: error instanceof Error ? error.message : "Unable to load layout",
      }),
  );

  function initializeConversation(path: string, activity = state.activity): boolean {
    const [pathname, search] = path.split("?");
    if (pathname !== "/new") return false;
    const identity = new URLSearchParams(search).get("draftId") ?? path;
    if (initializedDrafts.has(identity)) return false;
    initializedDrafts.add(identity);
    if (resize) {
      preferences = resize.preferences;
      if (!state.hydrated) pendingPreferences = resize.pendingPreferences;
    }
    resize = null;
    updatePreferences({ contentVisible: false, filesVisible: false });
    publish({ activity, contentMaximized: false, workspaceActionsVisible: false });
    persist();
    return true;
  }

  return {
    getSnapshot: () => state,
    setReducedTransparency(value: boolean) {
      if (value !== state.reducedTransparency) publish({ reducedTransparency: value });
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyRoute(path: string) {
      let activity: WorkbenchActivity = "home";
      if (path.startsWith("/settings")) activity = "settings";
      else if (path === "/schedules") activity = "schedules";
      else homePath = path;
      if (!initializeConversation(path, activity) && activity !== state.activity)
        publish({ activity });
    },
    startConversation(path: string) {
      initializeConversation(path);
      services.navigate(path);
    },
    selectActivity(activity: WorkbenchActivity) {
      const path = activity === "home" ? homePath : `/${activity}`;
      services.navigate(path);
    },
    selectHost(serverId: string) {
      publish({ hostPickerOpen: false });
      services.selectHost(serverId);
    },
    setHostPickerOpen(open: boolean) {
      publish({ hostPickerOpen: open });
    },
    addHost() {
      publish({ hostPickerOpen: false });
      services.addHost();
    },
    openHostSettings(serverId: string) {
      publish({ hostPickerOpen: false });
      services.openHostSettings(serverId);
    },
    setViewport(width: number) {
      if (width > 0 && width !== state.viewport) publish({ viewport: width });
    },
    setWindowWidth(width: number) {
      if (width > 0 && width !== state.windowWidth) publish({ windowWidth: width });
    },
    setRegionVisible(region: "content" | "files", visible: boolean) {
      if (preferences[`${region}Visible`] === visible) return;
      updatePreferences({ [`${region}Visible`]: visible });
      publish({ contentMaximized: false });
      persist();
    },
    setContentMaximized(maximized: boolean) {
      publish({ contentMaximized: maximized });
    },
    toggleWorkspaceActions() {
      publish({ workspaceActionsVisible: !state.workspaceActionsVisible });
    },
    beginResize(boundary: WorkbenchBoundary, pointer: number) {
      resize = {
        boundary,
        start: pointer,
        contentWidth: state.contentWidth,
        filesWidth: state.filesWidth,
        navigationWidth: state.navigationWidth,
        initialNavigationWidth: state.navigationWidth,
        preferences,
        pendingPreferences: { ...pendingPreferences },
      };
      publish();
    },
    updateResize(pointer: number) {
      if (!resize) return;
      const delta = pointer - resize.start;
      if (resize.boundary === "navigation") {
        resize.navigationWidth = Math.max(
          200,
          Math.min(600, state.windowWidth - 660, resize.initialNavigationWidth + delta),
        );
      } else if (resize.boundary === "content") {
        updatePreferences({
          contentWidth: Math.max(
            300,
            Math.min(1600, state.viewport - state.filesWidth - 312, resize.contentWidth - delta),
          ),
        });
      } else {
        updatePreferences({
          filesWidth: Math.max(
            160,
            Math.min(
              600,
              state.viewport - (state.contentWidth ? 612 : 306),
              resize.filesWidth - delta,
            ),
          ),
        });
      }
      publish();
    },
    commitResize() {
      if (!resize) return;
      const finished = resize;
      resize = null;
      if (finished.boundary === "navigation")
        services.saveNavigationWidth(finished.navigationWidth);
      else persist();
      publish();
    },
    cancelResize() {
      if (!resize) return;
      preferences = resize.preferences;
      if (!state.hydrated) pendingPreferences = resize.pendingPreferences;
      resize = null;
      publish();
    },
    retryPersistence() {
      persist();
    },
    resetLayout() {
      resize = null;
      updatePreferences({ ...WorkbenchPreferencesSchema.parse({}), contentWidth: undefined });
      services.saveNavigationWidth(220);
      publish({ contentMaximized: false });
      persist();
    },
    dispose() {
      disposed = true;
      unsubscribeNavigation();
      initializedDrafts.clear();
      listeners.clear();
    },
  };
}

export type WorkbenchModel = ReturnType<typeof createWorkbenchModel>;
