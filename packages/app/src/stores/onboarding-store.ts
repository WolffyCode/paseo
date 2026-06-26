import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

interface OnboardingStoreState {
  hasSeenWelcome: boolean;
  markWelcomeSeen: () => void;
}

// Creates the persisted onboarding store so tests can use deterministic storage without mocking app code.
export function createOnboardingStore(storage: StateStorage) {
  return create<OnboardingStoreState>()(
    persist(
      (set, get) => ({
        hasSeenWelcome: false,
        // Marks the one-time welcome as seen without rewriting storage after it is already true.
        markWelcomeSeen: () => {
          if (get().hasSeenWelcome) {
            return;
          }
          set({ hasSeenWelcome: true });
        },
      }),
      {
        name: "onboarding",
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({
          hasSeenWelcome: state.hasSeenWelcome,
        }),
      },
    ),
  );
}

export const useOnboardingStore = createOnboardingStore(AsyncStorage);

// Reports whether the persisted onboarding flag has loaded so startup never flashes first-run UI.
export function useOnboardingStoreHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(() => useOnboardingStore.persist.hasHydrated());

  useEffect(() => {
    if (useOnboardingStore.persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }

    return useOnboardingStore.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
  }, []);

  return hasHydrated;
}
