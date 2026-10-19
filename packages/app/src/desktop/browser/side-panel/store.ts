import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

/** The pages of Customize Chrome this browser has (customize_chrome app.ts sections). */
export type CustomizeChromePage = "overview" | "toolbar";

/** A tab's Customize Chrome panel; a closed one keeps its page while it slides out. */
export interface CustomizeChromePanel {
  page: CustomizeChromePage;
  isOpen: boolean;
}

interface BrowserSidePanelState {
  /**
   * Each tab's Customize Chrome panel. Chrome's side panel entries belong to a tab, and none
   * reopen after a restart, so this isn't persisted.
   */
  customizeChromeByBrowserId: Readonly<Record<string, CustomizeChromePanel>>;
  showCustomizeChrome: (browserId: string, page: CustomizeChromePage) => void;
  closeSidePanel: (browserId: string) => void;
}

export const useBrowserSidePanelStore = create<BrowserSidePanelState>()((set) => ({
  customizeChromeByBrowserId: {},
  showCustomizeChrome: (browserId, page) => {
    set((state) => ({
      customizeChromeByBrowserId: {
        ...state.customizeChromeByBrowserId,
        [browserId]: { page, isOpen: true },
      },
    }));
  },
  closeSidePanel: (browserId) => {
    set((state) => {
      const panel = state.customizeChromeByBrowserId[browserId];
      if (!panel) {
        return state;
      }
      return {
        customizeChromeByBrowserId: {
          ...state.customizeChromeByBrowserId,
          [browserId]: { ...panel, isOpen: false },
        },
      };
    });
  },
}));

// Chrome's side panel: 360 dip of content between two 9 dip borders, and no narrower
// (side_panel_entry.h kSidePanelDefaultContentWidth; browser_view_tabbed_layout_impl.cc).
const SIDE_PANEL_CONTENT_WIDTH = 360;
export const SIDE_PANEL_BORDER = 9;
export const SIDE_PANEL_MIN_WIDTH = SIDE_PANEL_CONTENT_WIDTH + SIDE_PANEL_BORDER * 2;
// A content-height side panel takes at most two thirds of the window.
const SIDE_PANEL_MAX_SHARE = 2 / 3;

/** The panel width Chrome lays out: the remembered one, kept between its minimum and maximum. */
export function sidePanelWidth(input: { rememberedWidth: number; windowWidth: number }): number {
  const maxWidth = Math.floor(input.windowWidth * SIDE_PANEL_MAX_SHARE);
  return Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(input.rememberedWidth, maxWidth));
}

const SidePanelWidthSchema = z.object({
  customizeChromeWidth: z.number(),
});

interface SidePanelWidthState {
  /** The full width, borders included, as Chrome's side_panel.id_to_width["kCustomizeChrome"]. */
  customizeChromeWidth: number;
  setCustomizeChromeWidth: (width: number) => void;
}

/** The width the user dragged the panel to, reused the next time it opens. */
export const useSidePanelWidthStore = create<SidePanelWidthState>()(
  persist(
    (set) => ({
      customizeChromeWidth: SIDE_PANEL_MIN_WIDTH,
      setCustomizeChromeWidth: (width) => set({ customizeChromeWidth: width }),
    }),
    {
      name: "browser-side-panel-width",
      storage: createValidatedPersistStorage(AsyncStorage, SidePanelWidthSchema),
      partialize: (state) => ({ customizeChromeWidth: state.customizeChromeWidth }),
    },
  ),
);

const SidePanelPositionSchema = z.object({
  isRightAligned: z.boolean(),
});

interface SidePanelPositionState {
  isRightAligned: boolean;
  setIsRightAligned: (isRightAligned: boolean) => void;
}

/** Chrome's side_panel.is_right_aligned: settings' 侧边栏位置, right by default. */
export const useSidePanelPositionStore = create<SidePanelPositionState>()(
  persist(
    (set) => ({
      isRightAligned: true,
      setIsRightAligned: (isRightAligned) => set({ isRightAligned }),
    }),
    {
      name: "browser-side-panel-position",
      storage: createValidatedPersistStorage(AsyncStorage, SidePanelPositionSchema),
      partialize: (state) => ({ isRightAligned: state.isRightAligned }),
    },
  ),
);
