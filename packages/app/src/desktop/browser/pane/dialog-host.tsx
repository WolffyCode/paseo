import { createContext, useContext } from "react";

/**
 * The element a page's dialogs center over: the page area below the toolbar, where Chrome
 * places a tab's dialogs. Null until the page has mounted.
 */
const BrowserDialogHostContext = createContext<HTMLElement | null>(null);

export const BrowserDialogHostProvider = BrowserDialogHostContext.Provider;

export function useBrowserDialogHost(): HTMLElement | null {
  return useContext(BrowserDialogHostContext);
}
