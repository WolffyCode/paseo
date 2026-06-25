import { beforeEach, describe, expect, it } from "vitest";
import { createOnboardingStore } from "./onboarding-store";

// Creates deterministic storage so persistence behavior is tested without platform globals.
function createMemoryStorage() {
  const values = new Map<string, string>();
  const writes: Array<{ name: string; value: string }> = [];
  return {
    writes,
    storage: {
      getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => {
        values.set(name, value);
        writes.push({ name, value });
      },
      removeItem: (name: string) => {
        values.delete(name);
      },
    },
  };
}

const memoryStorage = createMemoryStorage();
const onboardingStore = createOnboardingStore(memoryStorage.storage);

// Resets only the onboarding flag and write log so each store test starts from first-run state.
function resetOnboardingStore(): void {
  onboardingStore.setState({ hasSeenWelcome: false });
  memoryStorage.writes.length = 0;
}

describe("createOnboardingStore", () => {
  beforeEach(() => {
    resetOnboardingStore();
  });

  it("starts with the welcome unseen so a fresh install can show onboarding once", () => {
    expect(onboardingStore.getState().hasSeenWelcome).toBe(false);
  });

  it("marks the welcome as seen for later launches", () => {
    onboardingStore.getState().markWelcomeSeen();

    expect(onboardingStore.getState().hasSeenWelcome).toBe(true);
  });

  it("keeps markWelcomeSeen idempotent so repeated welcome actions do not write again", () => {
    onboardingStore.getState().markWelcomeSeen();
    onboardingStore.getState().markWelcomeSeen();

    expect(onboardingStore.getState().hasSeenWelcome).toBe(true);
    expect(memoryStorage.writes).toHaveLength(1);
  });

  it("persists only the welcome flag so UI actions do not leak into storage", () => {
    const persisted = onboardingStore.persist.getOptions().partialize?.(onboardingStore.getState());

    expect(persisted).toEqual({ hasSeenWelcome: false });
  });
});
