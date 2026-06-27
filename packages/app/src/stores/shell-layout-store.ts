import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { clampRegionWidth, type ShellRegion } from "./shell-regions";

// Single source of truth for the desktop home shell's chrome: which of the three
// side regions are open and how wide each is per workspace. Persisted so the
// arrangement survives reloads. The center canvas is implicit (always on) and the
// mobile shell keeps its own truth in panel-store — this store is desktop-only.
export interface ShellLayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  // workspaceKey -> region -> remembered width (px, already clamped on write).
  widthByRegion: Record<string, Partial<Record<ShellRegion, number>>>;

  toggleRegion: (region: ShellRegion) => void;
  setRegionOpen: (region: ShellRegion, open: boolean) => void;
  setRegionWidth: (workspaceKey: string, region: ShellRegion, px: number) => void;
}

// Maps a region to its open flag so the actions can stay data-driven instead of
// branching per region.
const OPEN_FIELD: Record<ShellRegion, "leftOpen" | "rightOpen" | "fileTreeOpen"> = {
  left: "leftOpen",
  right: "rightOpen",
  fileTree: "fileTreeOpen",
};

export const useShellLayoutStore = create<ShellLayoutState>()(
  persist(
    (set) => ({
      // Defaults match s1's landing state: left expanded, right + file tree collapsed.
      leftOpen: true,
      rightOpen: false,
      fileTreeOpen: false,
      widthByRegion: {},

      // Flip one region's open flag; the three are additive and never touch siblings.
      toggleRegion: (region) =>
        set((state) => ({ [OPEN_FIELD[region]]: !state[OPEN_FIELD[region]] })),

      setRegionOpen: (region, open) => set({ [OPEN_FIELD[region]]: open }),

      // Persist a clamped width for this workspace, leaving sibling regions and
      // other workspaces' remembered widths untouched.
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
    }),
    {
      name: "shell-layout-state",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        leftOpen: state.leftOpen,
        rightOpen: state.rightOpen,
        fileTreeOpen: state.fileTreeOpen,
        widthByRegion: state.widthByRegion,
      }),
    },
  ),
);
