import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  getPinnedTargets,
  isPinned,
  mergePersistedSidebarPins,
  type PinTarget,
  serializeSidebarPins,
  type SidebarPinsState,
  togglePin,
} from "./state";

interface SidebarPinsStoreState extends SidebarPinsState {
  togglePin: (serverId: string, target: PinTarget) => void;
  isPinned: (serverId: string, target: PinTarget) => boolean;
  getPinnedTargets: (serverId: string) => PinTarget[];
}

export const useSidebarPinsStore = create<SidebarPinsStoreState>()(
  persist(
    (set, get) => ({
      pinnedByServerId: {},
      togglePin: (serverId, target) => set((state) => togglePin(state, serverId, target)),
      isPinned: (serverId, target) => isPinned(get(), serverId, target),
      getPinnedTargets: (serverId) => getPinnedTargets(get(), serverId),
    }),
    {
      name: "sidebar-pins",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeSidebarPins(state),
      merge: (persistedState, currentState) =>
        mergePersistedSidebarPins(
          persistedState as { pinnedByServerId?: unknown } | undefined,
          currentState,
        ),
    },
  ),
);
