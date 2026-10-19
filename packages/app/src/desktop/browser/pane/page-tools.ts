import type { TFunction } from "i18next";
import { getDesktopHost } from "@/desktop/host";
import { DEVICE_SIZE_PRESETS, deviceSizeLabel, type DeviceSizeId } from "./device-sizes";

export type PageToolsChoice =
  | { kind: "annotate" }
  | { kind: "screenshot" }
  | { kind: "device"; deviceSizeId: DeviceSizeId };

const DEVICE_CHOICE_PREFIX = "device:";

/**
 * Paseo's own page tools, offered from one toolbar button the way Chrome offers an extension:
 * pick an element for the agent, copy an element as a screenshot, preview a device size.
 */
export async function chooseFromPageTools(input: {
  t: TFunction;
  selectorMode: "annotate" | "screenshot" | null;
  deviceSizeId: DeviceSizeId | null;
  anchor: { x: number; y: number };
}): Promise<PageToolsChoice | null> {
  const popup = getDesktopHost()?.menu?.popup;
  if (!popup) {
    return null;
  }
  const { t, selectorMode } = input;
  const chosen = await popup({
    x: input.anchor.x,
    y: input.anchor.y,
    items: [
      {
        id: "annotate",
        label:
          selectorMode === "annotate"
            ? t("workspace.browser.controls.cancelSelector")
            : t("workspace.browser.controls.annotateElement"),
      },
      {
        id: "screenshot",
        label:
          selectorMode === "screenshot"
            ? t("workspace.browser.controls.cancelSelector")
            : t("workspace.browser.controls.screenshotElement"),
      },
      { kind: "separator" },
      {
        label: t("workspace.browser.devices.label"),
        submenu: DEVICE_SIZE_PRESETS.map((preset) => ({
          id: `${DEVICE_CHOICE_PREFIX}${preset.id}`,
          label: deviceSizeLabel(preset, t),
          kind: "checkbox" as const,
          isChecked: preset.id === input.deviceSizeId,
        })),
      },
    ],
  });
  if (chosen === "annotate" || chosen === "screenshot") {
    return { kind: chosen };
  }
  if (chosen?.startsWith(DEVICE_CHOICE_PREFIX)) {
    const deviceSizeId = chosen.slice(DEVICE_CHOICE_PREFIX.length) as DeviceSizeId;
    return { kind: "device", deviceSizeId };
  }
  return null;
}
