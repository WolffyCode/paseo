/**
 * The user agent the browser session sends: Electron's own, minus the Electron and app tokens.
 * Sites such as Google sign-in and the Chrome Web Store treat a browser that names Electron or
 * an unknown app as unsupported; without those tokens the string is the one Chrome sends.
 */
export function chromeUserAgent(input: { userAgent: string; appName: string }): string {
  const appToken = new RegExp(` ${escapeRegExp(input.appName)}/\\S+`, "g");
  return input.userAgent.replace(/ Electron\/\S+/g, "").replace(appToken, "");
}

const GOOGLE_CHROME_BRAND = "Google Chrome";
const CHROMIUM_BRAND = "Chromium";

/**
 * A Sec-CH-UA brand list (`"Chromium";v="152", ...`) with Google Chrome added at Chromium's
 * version. Chromium's list names Chromium only, and Google's sites read the brands, not the user
 * agent string: the Chrome Web Store asks you to "switch to Chrome" without this.
 */
export function withGoogleChromeBrand(brandList: string): string {
  const brands = [...brandList.matchAll(/"([^"]*)";v="([^"]*)"/g)].map((match) => ({
    brand: match[1],
    version: match[2],
  }));
  const chromium = brands.find((entry) => entry.brand === CHROMIUM_BRAND);
  const hasGoogleChrome = brands.some((entry) => entry.brand === GOOGLE_CHROME_BRAND);
  if (!chromium || hasGoogleChrome) {
    return brandList;
  }
  return `${brandList}, "${GOOGLE_CHROME_BRAND}";v="${chromium.version}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
