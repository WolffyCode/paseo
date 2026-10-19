import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TFunction } from "i18next";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PRODUCT_NAME } from "@/constants/product";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import { CHROME_AVATAR_IDS, type ChromeAvatarId } from "./avatar-ids";

const BrowserProfileSchema = z.object({
  name: z.string().nullable(),
  avatarId: z.enum(CHROME_AVATAR_IDS).nullable(),
});

interface BrowserProfileState {
  /** The name the user gave the profile, or null while it has Chrome's default name. */
  name: string | null;
  /** The default avatar the user picked, or null for Chrome's placeholder. */
  avatarId: ChromeAvatarId | null;
  setName: (name: string) => void;
  setAvatar: (avatarId: ChromeAvatarId | null) => void;
}

/**
 * The browser's one local profile (Chrome's ProfileAttributesEntry name and avatar). There is no
 * Google account behind it, so it can't sign in or sync.
 */
export const useBrowserProfileStore = create<BrowserProfileState>()(
  persist(
    (set) => ({
      name: null,
      avatarId: null,
      setName: (name) => set({ name }),
      setAvatar: (avatarId) => set({ avatarId }),
    }),
    {
      name: "browser-profile",
      storage: createValidatedPersistStorage(AsyncStorage, BrowserProfileSchema),
      partialize: (state) => ({ name: state.name, avatarId: state.avatarId }),
    },
  ),
);

/**
 * The name the 自定义个人资料 field saves for typed text, or null when Chrome's pattern (.*\S.*)
 * refuses it; ManageProfileHandler trims what it saves.
 */
export function profileNameToSave(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** What Chrome calls the profile: its name, or 您的 Chrome until it has one. */
export function profileDisplayName(name: string | null, t: TFunction): string {
  return name ?? t("workspace.browser.profile.defaultName", { product: PRODUCT_NAME });
}
