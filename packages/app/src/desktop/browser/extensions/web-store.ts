/** Chrome Web Store pages the browser links to, where Chrome links. */
export const CHROME_WEB_STORE_HOME_URL = "https://chromewebstore.google.com/";
export const CHROME_WEB_STORE_EXTENSIONS_URL =
  "https://chromewebstore.google.com/category/extensions";

export function chromeWebStoreDetailUrl(extensionId: string): string {
  return `https://chromewebstore.google.com/detail/${extensionId}`;
}
