import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  migratePanelState,
  selectIsAgentListOpen,
  selectPanelVisibility,
  type DesktopSidebarState,
  type MobilePanelView,
  type PanelLayoutInput,
  type PanelVisibilityState,
  type SortOption,
} from "./state";
import { isWeb } from "@/constants/platform";
export type {
  DesktopSidebarState,
  MobilePanelView,
  PanelLayoutInput,
  PanelVisibilityState,
  SortOption,
} from "./state";
export {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  selectPanelVisibility,
};

export interface PanelState {
  // Mobile: which panel is currently shown
  mobileView: MobilePanelView;

  // Desktop: independent sidebar toggles
  desktop: DesktopSidebarState;

  // File tree settings (shared between the file explorer and diff panes)
  expandedPathsByWorkspace: Record<string, string[]>;
  diffExpandedPathsByWorkspace: Record<string, string[]>;
  sidebarWidth: number;
  explorerSortOption: SortOption;
  explorerShowHiddenFiles: boolean;

  // Actions
  toggleFocusMode: () => void;
  showMobileAgent: () => void;
  showMobileAgentList: () => void;
  toggleMobileAgentList: () => void;
  openDesktopAgentList: () => void;
  closeDesktopAgentList: () => void;
  toggleDesktopAgentList: () => void;
  openAgentListForLayout: (input: PanelLayoutInput) => void;
  closeAgentListForLayout: (input: PanelLayoutInput) => void;
  toggleAgentListForLayout: (input: PanelLayoutInput) => void;

  // File tree settings actions
  setExpandedPathsForWorkspace: (workspaceKey: string, paths: string[]) => void;
  setDiffExpandedPathsForWorkspace: (workspaceKey: string, paths: string[]) => void;
  setSidebarWidth: (width: number) => void;
  setExplorerSortOption: (option: SortOption) => void;
  toggleExplorerShowHiddenFiles: () => void;
}

const DEFAULT_DESKTOP_OPEN = isWeb;

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      // Mobile always starts at agent view
      mobileView: "agent",

      // Desktop defaults based on platform
      desktop: {
        agentListOpen: DEFAULT_DESKTOP_OPEN,
        fileExplorerOpen: false,
        focusModeEnabled: false,
      },

      // File tree defaults
      expandedPathsByWorkspace: {},
      diffExpandedPathsByWorkspace: {},
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      explorerSortOption: "name",
      explorerShowHiddenFiles: true,

      toggleFocusMode: () =>
        set((state) => ({
          desktop: { ...state.desktop, focusModeEnabled: !state.desktop.focusModeEnabled },
        })),

      showMobileAgent: () =>
        set((state) => {
          if (state.mobileView === "agent") {
            return state;
          }
          return { mobileView: "agent" as const };
        }),

      showMobileAgentList: () =>
        set((state) => {
          if (state.mobileView === "agent-list") {
            return state;
          }
          return { mobileView: "agent-list" as const };
        }),

      toggleMobileAgentList: () =>
        set((state) => ({
          mobileView: state.mobileView === "agent-list" ? "agent" : "agent-list",
        })),

      openDesktopAgentList: () =>
        set((state) => {
          if (state.desktop.agentListOpen) {
            return state;
          }
          return { desktop: { ...state.desktop, agentListOpen: true } };
        }),

      closeDesktopAgentList: () =>
        set((state) => {
          if (!state.desktop.agentListOpen) {
            return state;
          }
          return { desktop: { ...state.desktop, agentListOpen: false } };
        }),

      toggleDesktopAgentList: () =>
        set((state) => ({
          desktop: { ...state.desktop, agentListOpen: !state.desktop.agentListOpen },
        })),

      openAgentListForLayout: ({ isCompact }) =>
        set((state) => {
          if (isCompact) {
            return state.mobileView === "agent-list"
              ? state
              : { mobileView: "agent-list" as const };
          }
          return state.desktop.agentListOpen
            ? state
            : { desktop: { ...state.desktop, agentListOpen: true } };
        }),

      closeAgentListForLayout: ({ isCompact }) =>
        set((state) => {
          if (isCompact) {
            return state.mobileView === "agent" ? state : { mobileView: "agent" as const };
          }
          return state.desktop.agentListOpen
            ? { desktop: { ...state.desktop, agentListOpen: false } }
            : state;
        }),

      toggleAgentListForLayout: ({ isCompact }) =>
        set((state) => {
          if (isCompact) {
            return { mobileView: state.mobileView === "agent-list" ? "agent" : "agent-list" };
          }
          return {
            desktop: { ...state.desktop, agentListOpen: !state.desktop.agentListOpen },
          };
        }),

      setExpandedPathsForWorkspace: (workspaceKey, paths) =>
        set((state) => ({
          expandedPathsByWorkspace: { ...state.expandedPathsByWorkspace, [workspaceKey]: paths },
        })),
      setDiffExpandedPathsForWorkspace: (workspaceKey, paths) =>
        set((state) => ({
          diffExpandedPathsByWorkspace: {
            ...state.diffExpandedPathsByWorkspace,
            [workspaceKey]: paths,
          },
        })),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
      setExplorerSortOption: (option) => set({ explorerSortOption: option }),
      toggleExplorerShowHiddenFiles: () =>
        set((state) => ({ explorerShowHiddenFiles: !state.explorerShowHiddenFiles })),
    }),
    {
      name: "panel-state",
      version: 11,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState, version) =>
        migratePanelState(persistedState, version, { isWeb }) as unknown as PanelState,
      partialize: (state) => ({
        mobileView: state.mobileView,
        desktop: state.desktop,
        expandedPathsByWorkspace: state.expandedPathsByWorkspace,
        diffExpandedPathsByWorkspace: state.diffExpandedPathsByWorkspace,
        sidebarWidth: state.sidebarWidth,
        explorerSortOption: state.explorerSortOption,
        explorerShowHiddenFiles: state.explorerShowHiddenFiles,
      }),
    },
  ),
);
