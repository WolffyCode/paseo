import type {
  DesktopBrowserExtensionAction,
  DesktopBrowserExtensionActionDetails,
} from "@/desktop/host";

// electron-chrome-extensions serves action icons at this size with this resize mode
// (crx://extension-icon/<id>/<size>/<resize>); 32 px is a 16 dip icon on Retina.
const ACTION_ICON_PIXELS = 32;
const ACTION_ICON_RESIZE_DOWN = 2;

/** An extension's toolbar action for one tab: tab overrides win over the defaults, as in Chrome. */
export function actionDetailsForTab(
  action: DesktopBrowserExtensionAction,
  tabId: number | null,
): DesktopBrowserExtensionActionDetails {
  const { tabs, id: _extensionId, ...defaults } = action;
  const tabOverrides = tabId === null ? undefined : tabs[String(tabId)];
  return { ...defaults, ...tabOverrides };
}

/** The action icon as the browser profile draws it for a tab, refreshed when the icon changes. */
export function actionIconUrl(input: {
  extensionId: string;
  tabId: number | null;
  partition: string;
  iconModified?: number;
}): string {
  const params = new URLSearchParams({
    tabId: String(input.tabId ?? -1),
    partition: input.partition,
  });
  if (input.iconModified) {
    params.append("t", String(input.iconModified));
  }
  return `crx://extension-icon/${input.extensionId}/${ACTION_ICON_PIXELS}/${ACTION_ICON_RESIZE_DOWN}?${params}`;
}

/**
 * The badge background an extension set, as CSS. chrome.action colors arrive as CSS strings or
 * [r, g, b, a] with alpha in 0-255; null means none was set and the theme default applies.
 */
export function badgeBackgroundColor(
  color: DesktopBrowserExtensionActionDetails["color"],
): string | null {
  if (Array.isArray(color)) {
    const [red = 0, green = 0, blue = 0] = color;
    // Chrome paints badges opaque whatever alpha the extension asked for.
    return `rgb(${red},${green},${blue})`;
  }
  return color ?? null;
}

const DARK_TEXT = "#202124";
const LIGHT_TEXT = "#FFFFFF";
// Above this relative luminance, dark text contrasts more (color_utils::GetColorWithMaxContrast).
const LUMINANCE_THRESHOLD = 0.3;

// sRGB channel to linear light, the WCAG relative luminance formula.
function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function parseRgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const digits = hex[1] ?? "";
    const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color.trim());
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** Badge text color with the most contrast against its background, as Chrome picks it. */
export function badgeTextColor(background: string): string {
  const rgb = parseRgb(background);
  if (!rgb) {
    return LIGHT_TEXT;
  }
  const [red, green, blue] = rgb.map(channelLuminance) as [number, number, number];
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > LUMINANCE_THRESHOLD ? DARK_TEXT : LIGHT_TEXT;
}
