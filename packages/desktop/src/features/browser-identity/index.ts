import path from "node:path";
import type { Session } from "electron";
import { chromeUserAgent, withGoogleChromeBrand } from "./user-agent.js";

const BRAND_PRELOAD_ID = "paseo-browser-chrome-brand";
const BRAND_LIST_HEADERS = new Set(["sec-ch-ua", "sec-ch-ua-full-version-list"]);

/**
 * Makes the browser profile identify as the Chrome its kernel is: the user agent without the
 * Electron and app tokens, and Google Chrome among the client-hint brands. Sites that only
 * work in Chrome (the Chrome Web Store, Google sign-in) check these.
 */
export function presentBrowserSessionAsChrome(profileSession: Session, appName: string): void {
  profileSession.setUserAgent(
    chromeUserAgent({ userAgent: profileSession.getUserAgent(), appName }),
  );
  profileSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    for (const [name, value] of Object.entries(requestHeaders)) {
      if (BRAND_LIST_HEADERS.has(name.toLowerCase())) {
        requestHeaders[name] = withGoogleChromeBrand(value);
      }
    }
    callback({ requestHeaders });
  });
  profileSession.registerPreloadScript({
    id: BRAND_PRELOAD_ID,
    type: "frame",
    filePath: path.join(__dirname, "brand-preload.js"),
  });
}
