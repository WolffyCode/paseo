import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  REGION_CONSTRAINTS,
  clampRegionWidth,
  type ShellPage,
  type ShellRegion,
  type WorkspaceRegion,
} from "../selectors/regions";

// The desktop shell's single model: page mode, region visibility, and region geometry
// in one transactional truth source. Switching to settings and back is a cross-slice
// move, so these three concerns live in one store (not three). The view layer reads
// only through the facade + selectors; state changes only through these actions.

// The four open flags, named so the visibility primitive can stay data-driven.
type OpenField = "leftOpen" | "rightOpen" | "fileTreeOpen" | "settingsLeftOpen";

// The fields that survive a reload. currentPage and the hydration flag are excluded on
// purpose (a reload always lands on the conversation page; hydration is runtime-only).
export interface ShellPersistedState {
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  settingsLeftOpen: boolean;
  leftWidth: number;
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>>;
}

export interface ShellStoreState extends ShellPersistedState {
  // Page-navigation slice.
  currentPage: ShellPage;
  // persist rehydration-complete marker; reserved for first-frame width-flicker
  // suppression (don't paint a default-width frame before the stored width loads).
  _hydrated: boolean;

  // Page navigation. Entering settings must not touch any conversation flag/width — that
  // isolation is what restores the prior layout for free on return (no snapshot).
  openSettings: () => void;
  closeSettings: () => void;

  // Region visibility. The three conversation toggles are additive and independent; the
  // settings-nav toggle drives its own slice. openRight/closeRight are idempotent so
  // composed content actions can "ensure open/closed" without flip ambiguity.
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleFileTree: () => void;
  toggleSettingsLeft: () => void;
  openRight: () => void;
  closeRight: () => void;

  // Region geometry. Left width is global; right/fileTree widths are per-workspace.
  setLeftWidth: (px: number) => void;
  setRegionWidth: (workspaceKey: string, region: WorkspaceRegion, px: number) => void;
  resetRegionWidth: (region: ShellRegion, workspaceKey?: string) => void;

  // The single internal write primitive for the open flags: sets one field and never
  // touches a sibling. Every toggle/openRight/closeRight routes through it so the
  // "additive, isolated" guarantee lives in exactly one place.
  _setOpen: (field: OpenField, open: boolean) => void;
}

// Contract: keep exactly the persisted slice, dropping currentPage and the hydration
// flag. Exported so the persistence shape is a unit-testable pure function rather than a
// side effect hidden in the persist config.
export function partializeShellState(state: ShellStoreState): ShellPersistedState {
  return {
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    fileTreeOpen: state.fileTreeOpen,
    settingsLeftOpen: state.settingsLeftOpen,
    leftWidth: state.leftWidth,
    widthByRegion: state.widthByRegion,
  };
}

export const useShellStore = create<ShellStoreState>()(
  persist(
    (set, get) => ({
      // s1 landing defaults: conversation page, left open, right + tree closed, settings
      // nav open, left width 240.
      currentPage: "conversation",
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      settingsLeftOpen: true,
      leftWidth: REGION_CONSTRAINTS.left.default,
      widthByRegion: {},
      _hydrated: false,

      openSettings: () => set({ currentPage: "settings" }),
      closeSettings: () => set({ currentPage: "conversation" }),

      toggleLeft: () => get()._setOpen("leftOpen", !get().leftOpen),
      toggleRight: () => get()._setOpen("rightOpen", !get().rightOpen),
      toggleFileTree: () => get()._setOpen("fileTreeOpen", !get().fileTreeOpen),
      toggleSettingsLeft: () => get()._setOpen("settingsLeftOpen", !get().settingsLeftOpen),
      openRight: () => get()._setOpen("rightOpen", true),
      closeRight: () => get()._setOpen("rightOpen", false),

      setLeftWidth: (px) => set({ leftWidth: clampRegionWidth("left", px) }),

      setRegionWidth: (workspaceKey, region, px) =>
        set((state) => ({
          widthByRegion: {
            ...state.widthByRegion,
            [workspaceKey]: {
              ...state.widthByRegion[workspaceKey],
              [region]: clampRegionWidth(region, px),
            },
          },
        })),

      resetRegionWidth: (region, workspaceKey) => {
        if (region === "left") {
          set({ leftWidth: REGION_CONSTRAINTS.left.default });
          return;
        }
        if (workspaceKey == null) {
          return;
        }
        get().setRegionWidth(workspaceKey, region, REGION_CONSTRAINTS[region].default);
      },

      _setOpen: (field, open) => set({ [field]: open }),
    }),
    {
      name: "helm-shell-state",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: partializeShellState,
      onRehydrateStorage: () => () => {
        useShellStore.setState({ _hydrated: true });
      },
    },
  ),
);
