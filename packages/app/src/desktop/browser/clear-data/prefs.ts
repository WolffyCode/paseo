import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  CLEAR_DATA_TIME_PERIODS,
  DEFAULT_CHECKED_TYPES,
  DEFAULT_CLEAR_DATA_TIME_PERIOD,
  type ClearDataTimePeriod,
  type ClearDataType,
} from "./model";

const ClearDataPrefsSchema = z.object({
  timePeriod: z.enum(CLEAR_DATA_TIME_PERIODS),
  checked: z.object({
    history: z.boolean(),
    siteData: z.boolean(),
    cache: z.boolean(),
    downloads: z.boolean(),
  }),
});

interface ClearDataPrefsState {
  timePeriod: ClearDataTimePeriod;
  checked: Record<ClearDataType, boolean>;
  /** Chrome saves the dialog's choices only when 删除 is pressed (onDeleteBrowsingDataClick_). */
  remember: (choice: {
    timePeriod: ClearDataTimePeriod;
    checked: Record<ClearDataType, boolean>;
  }) => void;
}

/** Chrome's browser.clear_data.* prefs: the range and boxes the dialog opens with. */
export const useClearDataPrefsStore = create<ClearDataPrefsState>()(
  persist(
    (set) => ({
      timePeriod: DEFAULT_CLEAR_DATA_TIME_PERIOD,
      checked: DEFAULT_CHECKED_TYPES,
      remember: (choice) => set(choice),
    }),
    {
      name: "browser-clear-data-prefs",
      storage: createValidatedPersistStorage(AsyncStorage, ClearDataPrefsSchema),
      partialize: (state) => ({ timePeriod: state.timePeriod, checked: state.checked }),
    },
  ),
);
