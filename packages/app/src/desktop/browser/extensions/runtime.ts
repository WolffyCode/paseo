import { useEffect } from "react";
import { z } from "zod";
import { getIsElectron } from "@/constants/platform";
import {
  getDesktopHost,
  type DesktopBrowserExtensionInstallPrompt,
  type DesktopBrowserExtensionTabRequest,
} from "@/desktop/host";
import { useDesktopEvent } from "@/desktop/electron/use-desktop-event";
import {
  closeBrowserPage,
  openBrowserFromPage,
  revealBrowserPage,
} from "@/desktop/browser/workspace-browsers";
import { useBrowserExtensionsStore } from "./store";

const TabRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    requestId: z.number(),
    url: z.string().nullable(),
    isActive: z.boolean(),
    nearBrowserId: z.string().nullable(),
  }),
  z.object({ kind: z.literal("select"), browserId: z.string() }),
  z.object({ kind: z.literal("close"), browserId: z.string() }),
]);

const InstallPromptSchema = z.object({
  requestId: z.number(),
  browserId: z.string(),
  extensionId: z.string(),
  name: z.string(),
  iconDataUrl: z.string(),
  permissions: z.object({
    apiPermissions: z.array(z.string()),
    hostPatterns: z.array(z.string()),
    overridesNewTabPage: z.boolean(),
    homepageUrl: z.string().nullable(),
    searchUrl: z.string().nullable(),
    startupPageUrl: z.string().nullable(),
  }),
});

function logExtensionError(action: string): (error: unknown) => void {
  return (error) => {
    console.error(`[browser-extensions] ${action} failed`, error);
  };
}

async function refreshExtensions(): Promise<void> {
  const extensionsBridge = getDesktopHost()?.browser?.extensions;
  if (!extensionsBridge) {
    return;
  }
  const [extensions, newTabUrl] = await Promise.all([
    extensionsBridge.list(),
    extensionsBridge.getNewTabUrl(),
  ]);
  useBrowserExtensionsStore.setState({ extensions, newTabUrl });
}

async function refreshActions(): Promise<void> {
  const extensionsBridge = getDesktopHost()?.browser?.extensions;
  if (!extensionsBridge) {
    return;
  }
  const actionState = await extensionsBridge.getActionState();
  useBrowserExtensionsStore.setState({ actions: actionState.actions });
}

/**
 * Keeps the extension store in step with the browser profile: installs and removals, the new
 * tab page an extension supplies, and toolbar action changes (icons, badges, titles).
 */
export function useBrowserExtensionsSync(): void {
  useDesktopEvent("browser-extensions-changed", () => {
    void refreshExtensions().catch(logExtensionError("list"));
  });
  useEffect(() => {
    const extensionsBridge = getDesktopHost()?.browser?.extensions;
    if (!getIsElectron() || !extensionsBridge) {
      return;
    }
    void refreshExtensions().catch(logExtensionError("list"));
    void refreshActions().catch(logExtensionError("read actions"));
    return extensionsBridge.observeActions(() => {
      void refreshActions().catch(logExtensionError("read actions"));
    });
  }, []);
}

function handleTabRequest(request: DesktopBrowserExtensionTabRequest): void {
  const browserHost = getDesktopHost()?.browser;
  if (request.kind === "select") {
    revealBrowserPage(request.browserId);
    return;
  }
  if (request.kind === "close") {
    closeBrowserPage({ browserId: request.browserId, browserHost });
    return;
  }
  const browserId = request.nearBrowserId
    ? openBrowserFromPage({
        sourceBrowserId: request.nearBrowserId,
        url: request.url,
        isActive: request.isActive,
      })
    : null;
  if (browserId && request.isActive) {
    revealBrowserPage(browserId);
  }
  // A tab without a URL shows Helm's start page, which has no guest page for the extension to
  // hold, unless an extension supplies the new tab page.
  const hasGuestPage = request.url !== null || useBrowserExtensionsStore.getState().newTabUrl;
  void browserHost?.extensions
    ?.reportCreatedTab({
      requestId: request.requestId,
      browserId: browserId && hasGuestPage ? browserId : null,
    })
    .catch(logExtensionError("report created tab"));
}

/** Carries out the tab changes extensions ask for and collects Chrome Web Store install prompts. */
export function useBrowserExtensionRequests(): void {
  useDesktopEvent<unknown>("browser-extension-tab-request", (payload) => {
    const parsed = TabRequestSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[browser-extensions] malformed tab request", parsed.error);
      return;
    }
    handleTabRequest(parsed.data);
  });
  useDesktopEvent<unknown>("browser-extension-install-prompt", (payload) => {
    const parsed = InstallPromptSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("[browser-extensions] malformed install prompt", parsed.error);
      return;
    }
    const prompt: DesktopBrowserExtensionInstallPrompt = parsed.data;
    useBrowserExtensionsStore.setState((state) => ({
      installPromptsByBrowserId: { ...state.installPromptsByBrowserId, [prompt.browserId]: prompt },
    }));
  });
}

/** Answers the page's pending install prompt, as Chrome's dialog buttons do. */
export function answerExtensionInstallPrompt(browserId: string, isAllowed: boolean): void {
  const prompt = useBrowserExtensionsStore.getState().installPromptsByBrowserId[browserId];
  if (!prompt) {
    return;
  }
  useBrowserExtensionsStore.setState((state) => {
    const { [browserId]: _answered, ...remaining } = state.installPromptsByBrowserId;
    return { installPromptsByBrowserId: remaining };
  });
  void getDesktopHost()
    ?.browser?.extensions?.decideInstall({ requestId: prompt.requestId, isAllowed })
    .catch(logExtensionError("answer install prompt"));
}
