import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DesktopBrowserExtension,
  DesktopBrowserExtensionAction,
  DesktopBrowserExtensionInstallPrompt,
} from "@/desktop/host";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

/** What the browser profile reports about its extensions; it lives in the main process. */
interface BrowserExtensionsState {
  extensions: DesktopBrowserExtension[];
  /** The page new tabs open when an extension replaces Chrome's new tab page. */
  newTabUrl: string | null;
  actions: DesktopBrowserExtensionAction[];
  /** Chrome Web Store "Add extension?" questions waiting for an answer, by the asking page. */
  installPromptsByBrowserId: Readonly<Record<string, DesktopBrowserExtensionInstallPrompt>>;
}

export const useBrowserExtensionsStore = create<BrowserExtensionsState>()(() => ({
  extensions: [],
  newTabUrl: null,
  actions: [],
  installPromptsByBrowserId: {},
}));

const BrowserExtensionPinsSchema = z.object({
  pinnedExtensionIds: z.array(z.string()),
});

interface BrowserExtensionPinsState {
  /** Extensions shown as toolbar buttons, in pin order. Chrome keeps the rest in the puzzle menu. */
  pinnedExtensionIds: string[];
  setPinned: (extensionId: string, isPinned: boolean) => void;
}

export const useBrowserExtensionPinsStore = create<BrowserExtensionPinsState>()(
  persist(
    (set) => ({
      pinnedExtensionIds: [],
      setPinned: (extensionId, isPinned) => {
        set((state) => {
          const others = state.pinnedExtensionIds.filter((id) => id !== extensionId);
          return { pinnedExtensionIds: isPinned ? [...others, extensionId] : others };
        });
      },
    }),
    {
      name: "browser-extension-pins",
      storage: createValidatedPersistStorage(AsyncStorage, BrowserExtensionPinsSchema),
      partialize: (state) => ({ pinnedExtensionIds: state.pinnedExtensionIds }),
    },
  ),
);
