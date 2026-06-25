import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import { useOnboardingStore } from "./onboarding-store";

describe("onboarding-store", () => {
  beforeEach(() => {
    useOnboardingStore.setState({ hasSeenWelcome: false });
  });

  it("starts with hasSeenWelcome disabled", () => {
    expect(useOnboardingStore.getState().hasSeenWelcome).toBe(false);
  });

  it("marks welcome as seen", () => {
    useOnboardingStore.getState().markWelcomeSeen();

    expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true);
  });

  it("keeps the same state object when welcome was already marked", () => {
    useOnboardingStore.getState().markWelcomeSeen();
    const stateAfterFirstMark = useOnboardingStore.getState();

    useOnboardingStore.getState().markWelcomeSeen();

    expect(useOnboardingStore.getState()).toBe(stateAfterFirstMark);
  });
});
