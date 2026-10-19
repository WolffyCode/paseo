import { contextBridge } from "electron";

// Runs in Electron's sandbox and is tsc-compiled (not bundled): it may load nothing but "electron".

// Inside a webview, outerWidth and outerHeight report the whole app window, not the column the page
// is shown in. Chrome reports roughly the page's own window, and pages such as iTab size their
// layout from these values, so each page sees its own viewport here.
function matchOuterSizeToViewport(): void {
  Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth, configurable: true });
  Object.defineProperty(window, "outerHeight", {
    get: () => window.innerHeight,
    configurable: true,
  });
}

contextBridge.executeInMainWorld({ func: matchOuterSizeToViewport });
