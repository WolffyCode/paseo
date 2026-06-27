import { afterEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadOverridesFromStorage } from "@/hooks/use-keyboard-shortcut-overrides";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

const getItem = vi.mocked(AsyncStorage.getItem);

afterEach(() => {
  vi.restoreAllMocks();
  getItem.mockReset();
});

describe("loadOverridesFromStorage — client-prefs back-compat", () => {
  it("parses a stored override record", async () => {
    getItem.mockResolvedValueOnce(JSON.stringify({ "settings-toggle-cmd-comma-mac": "Cmd+Alt+," }));
    await expect(loadOverridesFromStorage()).resolves.toEqual({
      "settings-toggle-cmd-comma-mac": "Cmd+Alt+,",
    });
  });

  it("returns an empty record when nothing is stored", async () => {
    getItem.mockResolvedValueOnce(null);
    await expect(loadOverridesFromStorage()).resolves.toEqual({});
  });

  it("returns an empty record (never throws) when the stored JSON is corrupt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getItem.mockResolvedValueOnce("{ not valid json ");
    await expect(loadOverridesFromStorage()).resolves.toEqual({});
  });
});
