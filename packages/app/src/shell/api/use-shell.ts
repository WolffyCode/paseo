import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { type ShellStoreState, useShellStore } from "../model/shell-store";
import {
  type ShellContext,
  type ShellPage,
  type ShellRegion,
  selectTopBar,
  selectVisibleRegions,
  type TopBarModel,
  type VisibleRegions,
  type WorkspaceRegion,
} from "../selectors/regions";

// The shell's one public entry. Components import only from here, so they can never
// reach into the store internals — real public/private separation. The facade exposes
// the 11 atomic actions plus precise-subscription selector hooks; complex content
// interactions compose these atoms (they never re-implement layout transitions).

// Re-export the shared shapes so view code has a single import surface for the shell.
export type { ShellContext, ShellPage, ShellRegion, TopBarModel, VisibleRegions, WorkspaceRegion };

// The atomic shell actions — the only way the UI mutates shell state.
export interface ShellActions {
  openSettings: () => void;
  closeSettings: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleFileTree: () => void;
  toggleSettingsLeft: () => void;
  openRight: () => void;
  closeRight: () => void;
  setLeftWidth: (px: number) => void;
  setRegionWidth: (workspaceKey: string, region: WorkspaceRegion, px: number) => void;
  resetRegionWidth: (region: ShellRegion, workspaceKey?: string) => void;
}

// Project the store down to just its actions. zustand actions are stable references, so
// wrapping this in useShallow yields one stable ShellActions object — importing it never
// triggers a re-render.
const selectActions = (s: ShellStoreState): ShellActions => ({
  openSettings: s.openSettings,
  closeSettings: s.closeSettings,
  toggleLeft: s.toggleLeft,
  toggleRight: s.toggleRight,
  toggleFileTree: s.toggleFileTree,
  toggleSettingsLeft: s.toggleSettingsLeft,
  openRight: s.openRight,
  closeRight: s.closeRight,
  setLeftWidth: s.setLeftWidth,
  setRegionWidth: s.setRegionWidth,
  resetRegionWidth: s.resetRegionWidth,
});

export function useShellActions(): ShellActions {
  return useShellStore(useShallow(selectActions));
}

// Subscribe to just the current page mode.
export function useShellPage(): ShellPage {
  return useShellStore((s) => s.currentPage);
}

// Which region cards render and how wide each side card is. The result is a flat
// primitive shape, so useShallow re-renders only when a card's presence/width actually
// changes (a left-width drag updates left; an unrelated toggle is skipped).
export function useVisibleRegions(ctx: ShellContext): VisibleRegions {
  return useShellStore(useShallow((s) => selectVisibleRegions(s, ctx)));
}

// The derived top bar. It subscribes only to the page + the four open flags — the sole
// inputs to selectTopBar — so a width drag (which the top bar ignores) never re-renders
// it. Width fields are passed as ignored-by-contract constants to satisfy the shape.
export function useTopBar(ctx: ShellContext): TopBarModel {
  const nav = useShellStore(
    useShallow((s) => ({
      currentPage: s.currentPage,
      leftOpen: s.leftOpen,
      rightOpen: s.rightOpen,
      fileTreeOpen: s.fileTreeOpen,
      settingsLeftOpen: s.settingsLeftOpen,
    })),
  );
  return useMemo(() => selectTopBar({ ...nav, leftWidth: 0, widthByRegion: {} }, ctx), [nav, ctx]);
}

// Convenience facade for the root: grab page + visible regions + top bar + actions in
// one call. Leaf components use the fine-grained hooks above for precise subscriptions.
export function useShell(ctx: ShellContext): {
  page: ShellPage;
  visible: VisibleRegions;
  topBar: TopBarModel;
  actions: ShellActions;
} {
  return {
    page: useShellPage(),
    visible: useVisibleRegions(ctx),
    topBar: useTopBar(ctx),
    actions: useShellActions(),
  };
}
