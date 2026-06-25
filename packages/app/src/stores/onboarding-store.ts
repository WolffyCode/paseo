import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface OnboardingStoreState {
  hasSeenWelcome: boolean;
  markWelcomeSeen: () => void;
}

/** Contract: Persist whether first-run welcome onboarding has already been acknowledged. */
export const useOnboardingStore = create<OnboardingStoreState>()(
  persist(
    (set) => ({
      hasSeenWelcome: false,
      markWelcomeSeen: () => {
        set((state) => {
          if (state.hasSeenWelcome) {
            return state;
          }
          return { hasSeenWelcome: true };
        });
      },
    }),
    {
      name: "onboarding-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        hasSeenWelcome: state.hasSeenWelcome,
      }),
    },
  ),
);
