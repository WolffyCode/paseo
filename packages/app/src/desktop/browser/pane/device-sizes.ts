import type { TFunction } from "i18next";
import {
  createFixedBrowserViewport,
  RESPONSIVE_BROWSER_VIEWPORT,
  type BrowserViewport,
} from "@/desktop/browser/store";

export type DeviceSizeId =
  | "responsive"
  | "iphone-se"
  | "iphone-14"
  | "iphone-14-pro-max"
  | "pixel-7"
  | "galaxy-s20"
  | "ipad-mini"
  | "ipad-air"
  | "ipad-pro-11"
  | "ipad-pro-12"
  | "surface-pro"
  | "laptop"
  | "desktop-1080"
  | "desktop-1440";

type GenericDeviceNameKey = "responsive" | "laptop" | "desktop1080" | "desktop1440";

interface DeviceSizePreset {
  id: DeviceSizeId;
  /** Product names stay as they are; generic names are translated. */
  name: { productName: string } | { key: GenericDeviceNameKey };
  /** Fixed CSS size, or null to fill the page area. */
  width: number | null;
  height: number | null;
}

// Viewport presets for the in-app browser. "responsive" fills the pane; the others render a
// fixed-size, centered frame so a page can be previewed at common device sizes.
export const DEVICE_SIZE_PRESETS: readonly DeviceSizePreset[] = [
  { id: "responsive", name: { key: "responsive" }, width: null, height: null },
  { id: "iphone-se", name: { productName: "iPhone SE" }, width: 375, height: 667 },
  { id: "iphone-14", name: { productName: "iPhone 14" }, width: 390, height: 844 },
  {
    id: "iphone-14-pro-max",
    name: { productName: "iPhone 14 Pro Max" },
    width: 430,
    height: 932,
  },
  { id: "pixel-7", name: { productName: "Pixel 7" }, width: 412, height: 915 },
  { id: "galaxy-s20", name: { productName: "Galaxy S20" }, width: 360, height: 800 },
  { id: "ipad-mini", name: { productName: "iPad Mini" }, width: 768, height: 1024 },
  { id: "ipad-air", name: { productName: "iPad Air" }, width: 820, height: 1180 },
  { id: "ipad-pro-11", name: { productName: 'iPad Pro 11"' }, width: 834, height: 1194 },
  { id: "ipad-pro-12", name: { productName: 'iPad Pro 12.9"' }, width: 1024, height: 1366 },
  { id: "surface-pro", name: { productName: "Surface Pro" }, width: 912, height: 1368 },
  { id: "laptop", name: { key: "laptop" }, width: 1366, height: 768 },
  { id: "desktop-1080", name: { key: "desktop1080" }, width: 1920, height: 1080 },
  { id: "desktop-1440", name: { key: "desktop1440" }, width: 2560, height: 1440 },
];

/** A preset's menu label: its name, then its size for the fixed ones. */
export function deviceSizeLabel(preset: DeviceSizePreset, t: TFunction): string {
  const name =
    "productName" in preset.name
      ? preset.name.productName
      : t(`workspace.browser.devices.${preset.name.key}`);
  if (preset.width && preset.height) {
    return `${name} · ${preset.width}×${preset.height}`;
  }
  return name;
}

/** The preset a viewport matches, or null for a fixed size no preset has. */
export function deviceSizeIdForViewport(viewport: BrowserViewport): DeviceSizeId | null {
  if (viewport.mode === "responsive") {
    return "responsive";
  }
  const match = DEVICE_SIZE_PRESETS.find(
    (preset) => preset.width === viewport.width && preset.height === viewport.height,
  );
  return match?.id ?? null;
}

export function viewportForDeviceSize(deviceSizeId: DeviceSizeId): BrowserViewport {
  const preset = DEVICE_SIZE_PRESETS.find((candidate) => candidate.id === deviceSizeId);
  if (!preset || preset.width === null || preset.height === null) {
    return RESPONSIVE_BROWSER_VIEWPORT;
  }
  return createFixedBrowserViewport(preset.width, preset.height);
}
