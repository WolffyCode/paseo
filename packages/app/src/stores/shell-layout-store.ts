import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  REGION_CONSTRAINTS,
  clampRegionWidth,
  type ShellRegion,
  type WorkspaceRegion,
} from "./shell-regions";

// Single source of truth for the desktop home shell's chrome: which of the three
// side regions are open, the left rail's single global width, and the per-workspace
// widths of the two workspace tools. Persisted so the arrangement survives reloads.
// The center canvas is implicit (always on) and the mobile shell keeps its own
// truth in panel-store — this store is desktop-only.
export interface ShellLayoutState {
  leftOpen: boolean;
  rightOpen: boolean;
  fileTreeOpen: boolean;
  // The left rail's single app-wide width (px). Global on purpose — it is not
  // keyed by workspace, so entering or leaving a conversation never moves it.
  leftWidth: number;
  // workspaceKey -> workspace tool -> remembered width (px, already clamped on
  // write). The left rail is excluded: it uses the global leftWidth above.
  widthByRegion: Record<string, Partial<Record<WorkspaceRegion, number>>>;

  toggleRegion: (region: ShellRegion) => void;
  setRegionOpen: (region: ShellRegion, open: boolean) => void;
  setLeftWidth: (px: number) => void;
  setRegionWidth: (workspaceKey: string, region: WorkspaceRegion, px: number) => void;
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
      leftWidth: REGION_CONSTRAINTS.left.default,
      widthByRegion: {},

      // Flip one region's open flag; the three are additive and never touch siblings.
      toggleRegion: (region) =>
        set((state) => ({ [OPEN_FIELD[region]]: !state[OPEN_FIELD[region]] })),

      setRegionOpen: (region, open) => set({ [OPEN_FIELD[region]]: open }),

      // Persist the left rail's single global width (clamped to the left bounds).
      // One value for the whole app — never keyed by workspace.
      setLeftWidth: (px) => set({ leftWidth: clampRegionWidth("left", px) }),

      // Persist a clamped width for this workspace tool, leaving sibling tools and
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
        leftWidth: state.leftWidth,
        widthByRegion: state.widthByRegion,
      }),
    },
  ),
);
