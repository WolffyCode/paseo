import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BrowserAutomationBrowserIdSchema } from "@getpaseo/protocol/browser-automation/rpc-schemas";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  addBrowser,
  applyBrowserPatch,
  BrowserIndexStateSchema,
  type BrowserClosedEntry,
  type BrowserIndexState,
  type BrowserRecord,
  type BrowserRecordPatch,
  type BrowserViewport,
  createBrowserRecord,
  deleteBrowserHistory,
  normalizeBrowserIndexState,
  normalizeBrowserUrl,
  recordBrowserVisit,
  removeBrowser,
  sanitizeBrowsersForPersist,
  takeClosedBrowser,
  trimNonEmpty,
} from "./state";

export {
  createFixedBrowserViewport,
  RESPONSIVE_BROWSER_VIEWPORT,
  type BrowserClosedEntry,
  type BrowserRecord,
  type BrowserRecordPatch,
  type BrowserViewport,
} from "./state";

interface BrowserStoreState extends BrowserIndexState {
  /** A new page; a reopened one starts with its old title and icon. Returns its id. */
  createBrowser: (input?: {
    initialUrl?: string;
    title?: string;
    faviconUrl?: string | null;
  }) => string;
  /** Forgets a page; one that showed something goes on the recently closed list. */
  removeBrowser: (browserId: string) => void;
  /** Takes a page off the recently closed list, the newest by default. */
  takeClosedBrowser: (closedIndex?: number) => BrowserClosedEntry | null;
  updateBrowser: (browserId: string, patch: BrowserRecordPatch) => void;
  setBrowserViewport: (browserId: string, viewport: BrowserViewport) => void;
  recordVisit: (browserId: string) => void;
  /** Deletes history and recently closed pages from `since` on. */
  deleteHistory: (since: number) => void;
}

function createBrowserId(): string {
  let browserId: string;
  if (typeof globalThis.crypto?.randomUUID === "function") {
    browserId = globalThis.crypto.randomUUID();
  } else {
    const randomSuffix = Math.random().toString(16).slice(2) || "0";
    browserId = `${Date.now()}-${randomSuffix}`;
  }
  return BrowserAutomationBrowserIdSchema.parse(browserId);
}

export const useBrowserStore = create<BrowserStoreState>()(
  persist(
    (set, get) => ({
      browsersById: {},
      closedBrowsers: [],
      history: [],
      createBrowser: (input) => {
        const browserId = createBrowserId();
        const record: BrowserRecord = {
          ...createBrowserRecord({ browserId, initialUrl: input?.initialUrl, now: Date.now() }),
          title: input?.title ?? "",
          faviconUrl: input?.faviconUrl ?? null,
        };
        set((state) => addBrowser(state, record));
        return browserId;
      },
      removeBrowser: (browserId) => {
        set((state) => removeBrowser(state, { browserId, now: Date.now() }));
      },
      takeClosedBrowser: (closedIndex = 0) => {
        const taken = takeClosedBrowser(get(), closedIndex);
        if (taken.entry) {
          set({ closedBrowsers: taken.state.closedBrowsers });
        }
        return taken.entry;
      },
      updateBrowser: (browserId, patch) => {
        set((state) => applyBrowserPatch(state, browserId, patch));
      },
      setBrowserViewport: (browserId, viewport) => {
        set((state) => applyBrowserPatch(state, browserId, { viewport }));
      },
      recordVisit: (browserId) => {
        set((state) => recordBrowserVisit(state, browserId, Date.now()));
      },
      deleteHistory: (since) => {
        set((state) => deleteBrowserHistory(state, since));
      },
    }),
    {
      name: "workspace-browser-store",
      storage: createValidatedPersistStorage(AsyncStorage, BrowserIndexStateSchema),
      partialize: (state) => sanitizeBrowsersForPersist(state),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeBrowserIndexState(persistedState),
      }),
    },
  ),
);

function subscribeToBrowserStoreHydration(onHydrated: () => void): () => void {
  return useBrowserStore.persist.onFinishHydration(onHydrated);
}

function isBrowserStoreHydrated(): boolean {
  return useBrowserStore.persist.hasHydrated();
}

/** Saved pages load asynchronously; before that, a missing page is not yet a closed one. */
export function useBrowserStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToBrowserStoreHydration,
    isBrowserStoreHydrated,
    isBrowserStoreHydrated,
  );
}

export function getBrowserRecord(browserId: string): BrowserRecord | null {
  const normalizedBrowserId = trimNonEmpty(browserId);
  if (!normalizedBrowserId) {
    return null;
  }
  return useBrowserStore.getState().browsersById[normalizedBrowserId] ?? null;
}

export function normalizeWorkspaceBrowserUrl(value: string | null | undefined): string {
  return normalizeBrowserUrl(value);
}
