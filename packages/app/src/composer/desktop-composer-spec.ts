export const DESKTOP_COMPOSER_METRICS = {
  maxWidth: 760,
  sectionGap: 9,
  contextMinHeight: 36,
  directoryHeight: 34,
  directoryIconSize: 26,
  inputRadius: 16,
  editorMinHeight: 116,
  textareaMinHeight: 84,
  footerMinHeight: 48,
  actionSize: 34,
  runtimeMinHeight: 46,
  runtimeRadius: 16,
  runtimeControlHeight: 32,
  runtimePopoverOffset: 14,
  runtimePopoverRadius: 14,
} as const;

export type DesktopRuntimeControl = "model" | "reasoning" | "mode" | "feature" | "context";

export interface DesktopRuntimePopoverSpec {
  width: number;
  placement: "top-start" | "top-end";
  offset: number;
}

/** Return the approved anchored-popover geometry for one desktop runtime control. */
export function getDesktopRuntimePopoverSpec(
  control: DesktopRuntimeControl,
): DesktopRuntimePopoverSpec {
  const placement = control === "model" ? "top-start" : "top-end";
  let width: number;
  switch (control) {
    case "model":
      width = 345;
      break;
    case "reasoning":
      width = 250;
      break;
    case "mode":
      width = 270;
      break;
    case "feature":
      width = 240;
      break;
    case "context":
      width = 260;
      break;
  }
  return { width, placement, offset: DESKTOP_COMPOSER_METRICS.runtimePopoverOffset };
}
