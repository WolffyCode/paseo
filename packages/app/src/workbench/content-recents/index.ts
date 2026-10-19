import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  type ContentRecent,
  type ContentRecentInput,
  type ContentRecentsState,
  ContentRecentsStateSchema,
  type ConversationKey,
  conversationRecents,
  rebindContentRecents,
  recordContentRecent,
} from "./state";

export {
  contentRecentIdentity,
  findOpenTabForRecent,
  recentInputForTab,
  type OpenRecentTab,
  type ContentRecent,
  type ContentRecentInput,
  type ConversationKey,
} from "./state";

interface ContentRecentsStore extends ContentRecentsState {
  record: (conversation: ConversationKey, input: ContentRecentInput) => void;
  rebindConversation: (input: {
    workspaceKey: string;
    previousOwner: string;
    nextOwner: string;
  }) => void;
}

const NO_RECENTS: readonly ContentRecent[] = [];

export const useContentRecentsStore = create<ContentRecentsStore>()(
  persist<ContentRecentsStore, [], [], ContentRecentsState>(
    (set) => ({
      recentsByWorkspace: {},
      record: (conversation, input) =>
        set((state) => recordContentRecent(state, conversation, input, Date.now())),
      rebindConversation: (input) => set((state) => rebindContentRecents(state, input)),
    }),
    {
      name: "workbench-content-recents",
      storage: createValidatedPersistStorage(AsyncStorage, ContentRecentsStateSchema),
      partialize: (state) => ({ recentsByWorkspace: state.recentsByWorkspace }),
    },
  ),
);

export function useContentRecents(conversation: ConversationKey | null): readonly ContentRecent[] {
  return useContentRecentsStore((state) => {
    if (!conversation) return NO_RECENTS;
    return conversationRecents(state, conversation) ?? NO_RECENTS;
  });
}
