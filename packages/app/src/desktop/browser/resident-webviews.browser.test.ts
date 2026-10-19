import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyInactiveBrowserWebviewViewport,
  type BrowserWebviewProfileHost,
  clearResidentBrowserWebviewsForTests,
  ensureResidentBrowserWebview,
  getResidentBrowserWebview,
  prepareBrowserWebview,
  presentBrowserWebview,
  rememberBrowserWebviewSize,
  releaseResidentBrowserWebview,
  removeResidentBrowserWebview,
  resizeResidentBrowserWebview,
  takeResidentBrowserWebview,
} from "./resident-webviews";
import {
  setCommandCenterFocusRestoreElement,
  takeCommandCenterFocusRestoreElement,
} from "../../utils/command-center-focus-restore";

const RESIDENT_HOST_ID = "paseo-browser-resident-webviews";
const attachedBrowsers: Array<{
  browserId: string;
  workspaceId: string;
  webContentsId: number;
}> = [];
const profileHost: BrowserWebviewProfileHost = {
  profilePartition: "persist:paseo-browser",
  registerAttachedBrowser: async (input) => {
    attachedBrowsers.push(input);
  },
};

function ensureTestBrowser(input: {
  browserId: string;
  workspaceId: string;
  url: string;
}): HTMLElement | null {
  return ensureResidentBrowserWebview({ ...input, profileHost });
}

function prepareTestBrowser(
  webview: HTMLElement,
  input: { browserId: string; workspaceId: string; initialUrl?: string | null },
): void {
  prepareBrowserWebview(webview, { ...input, profileHost });
}

function residentHost(): HTMLElement {
  const host = document.getElementById(RESIDENT_HOST_ID);
  if (!host) {
    throw new Error("Expected resident browser host");
  }
  return host;
}

function expectPermanentHostParking(host: HTMLElement): void {
  expect(host.style.position).toBe("fixed");
  expect(host.style.left).toBe("0px");
  expect(host.style.top).toBe("0px");
  expect(host.style.width).toBe("100vw");
  expect(host.style.height).toBe("100vh");
  expect(host.style.overflow).toBe("visible");
  expect(host.style.opacity).toBe("1");
  expect(host.style.pointerEvents).toBe("none");
  expect(host.style.display).toBe("block");
  expect(host.style.zIndex).toBe("0");
}

function expectParkedSurface(surface: HTMLElement): void {
  expect(surface.getAttribute("aria-hidden")).toBe("true");
  expect(surface.style.position).toBe("fixed");
  expect(surface.style.left).toBe("0px");
  expect(surface.style.top).toBe("0px");
  expect(surface.style.width).toBe("1px");
  expect(surface.style.height).toBe("1px");
  expect(surface.style.overflow).toBe("hidden");
  expect(surface.style.opacity).toBe("1");
  expect(surface.style.pointerEvents).toBe("none");
  expect(surface.style.display).toBe("block");
  expect(surface.style.visibility).toBe("visible");
  expect(surface.style.transform).toBe("");
}

function expectResidentWebviewParking(webview: HTMLElement): void {
  expect(webview.style.display).toBe("inline-flex");
  expect(webview.style.flex).toBe("0 0 auto");
  expect(webview.style.width).toBe("1280px");
  expect(webview.style.height).toBe("800px");
  expect(webview.style.position).toBe("absolute");
  expect(webview.style.left).toBe("0px");
  expect(webview.style.top).toBe("0px");
  expect(webview.style.zIndex).toBe("0");
}

const paneFixtures: HTMLElement[] = [];

function mountPane(
  bounds: { left: number; top: number; width: number; height: number },
  content = bounds,
) {
  const clip = document.createElement("div");
  Object.assign(clip.style, {
    position: "fixed",
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    overflow: "hidden",
  });
  const anchor = document.createElement("div");
  Object.assign(anchor.style, {
    position: "absolute",
    left: `${content.left - bounds.left}px`,
    top: `${content.top - bounds.top}px`,
    width: content === bounds ? "100%" : `${content.width}px`,
    height: content === bounds ? "100%" : `${content.height}px`,
  });
  clip.appendChild(anchor);
  document.body.prepend(clip);
  paneFixtures.push(clip);
  return { anchor, clip };
}

function expectBounds(
  element: HTMLElement,
  bounds: { left: number; top: number; width: number; height: number },
) {
  const actual = element.getBoundingClientRect();
  expect({
    left: actual.left,
    top: actual.top,
    width: actual.width,
    height: actual.height,
  }).toEqual(bounds);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("resident browser webviews", () => {
  beforeEach(() => {
    attachedBrowsers.length = 0;
  });

  afterEach(() => {
    clearResidentBrowserWebviewsForTests();
    for (const fixture of paneFixtures.splice(0)) fixture.remove();
  });

  it("parks a browser webview in the permanent paintable 1x1 host", () => {
    const visibleHost = document.createElement("div");
    const webview = document.createElement("webview");
    visibleHost.appendChild(webview);
    document.body.appendChild(visibleHost);

    releaseResidentBrowserWebview("browser-a", webview);

    const host = residentHost();
    expect(visibleHost.children).toHaveLength(0);
    const surface = host.firstElementChild as HTMLElement;
    expect(Array.from(surface.children)).toEqual([webview]);
    expect(webview.isConnected).toBe(true);
    expectPermanentHostParking(host);
    expectParkedSurface(surface);
    expectResidentWebviewParking(webview);
  });

  it("presents and parks a browser without changing its webview parent", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-stable-parent",
      workspaceId: "workspace-stable-parent",
      url: "https://example.com",
    });
    const { anchor, clip } = mountPane({ left: 40, top: 60, width: 640, height: 480 });
    if (!webview?.parentElement) {
      throw new Error("Expected resident browser surface");
    }
    const permanentParent = webview.parentElement;

    presentBrowserWebview("browser-stable-parent", webview, anchor, clip, {
      mode: "responsive",
    });
    expect(webview.parentElement).toBe(permanentParent);
    expectBounds(permanentParent, { left: 40, top: 60, width: 640, height: 480 });
    expect(permanentParent.style.pointerEvents).toBe("auto");
    expect(permanentParent.getAttribute("aria-hidden")).toBe("false");
    expect(anchor.contains(webview)).toBe(true);
    expect(getComputedStyle(webview).position).toBe("relative");
    expect(getComputedStyle(permanentParent).position).toBe("relative");
    expectBounds(webview, { left: 40, top: 60, width: 640, height: 480 });

    releaseResidentBrowserWebview("browser-stable-parent", webview);
    expect(webview.parentElement).toBe(permanentParent);
    expectParkedSurface(permanentParent);

    presentBrowserWebview("browser-stable-parent", webview, anchor, clip, {
      mode: "responsive",
    });
    expect(webview.parentElement).toBe(permanentParent);
  });

  it("clips an oversized fixed viewport to its pane without resizing the webview", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-oversized",
      workspaceId: "workspace-oversized",
      url: "https://example.com",
    });
    if (!webview?.parentElement) {
      throw new Error("Expected resident browser surface");
    }
    const { anchor, clip } = mountPane(
      { left: 100, top: 150, width: 800, height: 600 },
      { left: -800, top: -300, width: 2560, height: 1440 },
    );

    presentBrowserWebview("browser-oversized", webview, anchor, clip, {
      mode: "fixed",
      width: 2560,
      height: 1440,
    });

    expect(clip.contains(webview)).toBe(true);
    expectBounds(webview, { left: -800, top: -300, width: 2560, height: 1440 });
    expect(document.elementFromPoint(90, 160)).not.toBe(webview);
    expect(document.elementFromPoint(110, 160)).toBe(webview);

    resizeResidentBrowserWebview({ browserId: "browser-oversized", width: 2560, height: 1440 });
    expect(clip.contains(webview)).toBe(true);
    expectBounds(webview, { left: -800, top: -300, width: 2560, height: 1440 });
  });

  it("follows a moving pane without a size change or a new presentation call", async () => {
    const clip = document.createElement("div");
    Object.assign(clip.style, {
      position: "fixed",
      left: "100px",
      top: "120px",
      width: "640px",
      height: "480px",
    });
    const anchor = document.createElement("div");
    Object.assign(anchor.style, { width: "100%", height: "100%" });
    clip.appendChild(anchor);
    document.body.prepend(clip);
    try {
      const webview = ensureTestBrowser({
        browserId: "browser-moving",
        workspaceId: "workspace-moving",
        url: "https://example.com",
      });
      if (!webview?.parentElement) throw new Error("Expected resident browser surface");
      const surface = webview.parentElement;
      presentBrowserWebview("browser-moving", webview, anchor, clip, { mode: "responsive" });
      expect(webview.getBoundingClientRect().left).toBe(anchor.getBoundingClientRect().left);
      clip.style.transform = "translate(140px, 35px)";
      await nextFrame();
      expect(surface.getBoundingClientRect().left).toBe(clip.getBoundingClientRect().left);
      expect(surface.getBoundingClientRect().top).toBe(clip.getBoundingClientRect().top);
      expect(webview.getBoundingClientRect().left).toBe(anchor.getBoundingClientRect().left);
      expect(webview.getBoundingClientRect().top).toBe(anchor.getBoundingClientRect().top);
      expect(webview.parentElement).toBe(surface);
    } finally {
      clip.remove();
    }
  });

  it("resizes with its pane and preserves the last viewport through hiding and parking", async () => {
    const { anchor, clip } = mountPane({ left: 40, top: 60, width: 640, height: 480 });
    const webview = ensureTestBrowser({
      browserId: "browser-resizing",
      workspaceId: "workspace-resizing",
      url: "https://example.com",
    });
    if (!webview?.parentElement) throw new Error("Expected resident browser surface");
    const surface = webview.parentElement;
    presentBrowserWebview("browser-resizing", webview, anchor, clip, { mode: "responsive" });
    clip.style.width = "720px";
    clip.style.height = "500px";
    await nextFrame();
    await nextFrame();
    expectBounds(surface, { left: 40, top: 60, width: 720, height: 500 });
    expectBounds(webview, { left: 40, top: 60, width: 720, height: 500 });
    clip.style.display = "none";
    expect(surface.getBoundingClientRect().width).toBe(0);
    expect(document.elementFromPoint(50, 70)).not.toBe(webview);
    releaseResidentBrowserWebview("browser-resizing", webview);
    expect(webview.style.width).toBe("720px");
    expect(webview.style.height).toBe("500px");
    clip.style.display = "block";
    clip.style.left = "180px";
    presentBrowserWebview("browser-resizing", webview, anchor, clip, { mode: "responsive" });
    expectBounds(webview, { left: 180, top: 60, width: 720, height: 500 });
    expect(webview.parentElement).toBe(surface);
  });

  it("keeps an inactive retained browser under its pane instead of parking it over the app", () => {
    const { anchor, clip } = mountPane({ left: 300, top: 100, width: 600, height: 400 });
    const webview = ensureTestBrowser({
      browserId: "inline-retained",
      workspaceId: "inline-retained",
      url: "https://example.com",
    });
    if (!webview) throw new Error("Expected browser");
    presentBrowserWebview("inline-retained", webview, anchor, clip, { mode: "responsive" });
    const parent = webview.parentElement;
    clip.style.display = "none";
    applyInactiveBrowserWebviewViewport("inline-retained", webview, { mode: "responsive" });
    expect(anchor.contains(webview)).toBe(true);
    expect(webview.parentElement).toBe(parent);
    expect(document.elementFromPoint(350, 150)).not.toBe(webview);
    clip.style.left = "450px";
    clip.style.display = "block";
    presentBrowserWebview("inline-retained", webview, anchor, clip, { mode: "responsive" });
    expect(webview.parentElement).toBe(parent);
    expectBounds(webview, { left: 450, top: 100, width: 600, height: 400 });
  });

  it("keeps a background browser paintable on its first attachment to a retained pane", () => {
    const { anchor, clip } = mountPane({ left: 0, top: 0, width: 1, height: 1 });
    const webview = ensureTestBrowser({
      browserId: "inline-background",
      workspaceId: "inline-background",
      url: "https://example.com",
    });
    if (!webview) throw new Error("Expected browser");
    presentBrowserWebview(
      "inline-background",
      webview,
      anchor,
      clip,
      { mode: "responsive" },
      false,
    );
    expect(anchor.contains(webview)).toBe(true);
    expect(webview.getBoundingClientRect().width).toBe(1280);
    expect(webview.getBoundingClientRect().height).toBe(800);
    expect(document.elementFromPoint(100, 100)).not.toBe(webview);
    expect(
      ensureTestBrowser({
        browserId: "inline-background",
        workspaceId: "inline-background",
        url: "https://example.com",
      }),
    ).toBe(webview);
    expect(anchor.contains(webview)).toBe(true);
  });

  it("creates a resident webview for an agent-created unfocused tab", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-agent",
      workspaceId: "workspace-agent",
      url: "https://example.com",
    });

    expect(webview).not.toBeNull();
    expect(webview?.isConnected).toBe(true);
    expect(webview?.getAttribute("data-paseo-browser-id")).toBe("browser-agent");
    expect(webview?.getAttribute("partition")).toBe("persist:paseo-browser");
    expect((webview as HTMLUnknownElement & { src?: string })?.src).toContain(
      "https://example.com",
    );
    expectPermanentHostParking(residentHost());
    expectResidentWebviewParking(webview as HTMLElement);
  });

  it("shares one profile and registers attached guests with explicit identity", () => {
    const firstWebview = ensureTestBrowser({
      browserId: "browser-first",
      workspaceId: "workspace-a",
      url: "https://example.com/first",
    });
    const secondWebview = ensureTestBrowser({
      browserId: "browser-second",
      workspaceId: "workspace-b",
      url: "https://example.com/second",
    });
    if (!firstWebview || !secondWebview) {
      throw new Error("Expected resident webviews");
    }
    Object.assign(firstWebview, { getWebContentsId: () => 101 });
    Object.assign(secondWebview, { getWebContentsId: () => 202 });

    firstWebview.dispatchEvent(new Event("did-attach"));
    secondWebview.dispatchEvent(new Event("did-attach"));

    expect(firstWebview.getAttribute("partition")).toBe("persist:paseo-browser");
    expect(secondWebview.getAttribute("partition")).toBe("persist:paseo-browser");
    expect(attachedBrowsers).toEqual([
      { browserId: "browser-first", workspaceId: "workspace-a", webContentsId: 101 },
      { browserId: "browser-second", workspaceId: "workspace-b", webContentsId: 202 },
    ]);
  });

  it("normalizes an existing resident host back to permanent parking", () => {
    const staleHost = document.createElement("div");
    staleHost.id = RESIDENT_HOST_ID;
    staleHost.style.left = "-20000px";
    staleHost.style.width = "1280px";
    staleHost.style.height = "800px";
    staleHost.style.opacity = "0";
    staleHost.style.display = "none";
    document.body.appendChild(staleHost);

    const webview = ensureTestBrowser({
      browserId: "browser-stale-host",
      workspaceId: "workspace-stale-host",
      url: "https://example.com",
    });

    expect(webview).not.toBeNull();
    expectPermanentHostParking(staleHost);
    expectResidentWebviewParking(webview as HTMLElement);
  });

  it("normalizes an existing resident webview and its stale host before reusing them", () => {
    const staleHost = document.createElement("div");
    staleHost.id = RESIDENT_HOST_ID;
    staleHost.style.left = "-20000px";
    staleHost.style.width = "1280px";
    staleHost.style.height = "800px";
    staleHost.style.opacity = "0";
    staleHost.style.display = "none";

    const staleWebview = document.createElement("webview");
    prepareTestBrowser(staleWebview, {
      browserId: "browser-stale-child",
      workspaceId: "workspace-stale-child",
      initialUrl: "https://example.com",
    });
    staleWebview.style.display = "none";
    staleWebview.style.width = "1px";
    staleWebview.style.height = "1px";
    staleWebview.style.position = "fixed";
    staleWebview.style.left = "-20000px";
    staleHost.appendChild(staleWebview);
    document.body.appendChild(staleHost);

    const webview = ensureTestBrowser({
      browserId: "browser-stale-child",
      workspaceId: "workspace-stale-child",
      url: "https://example.com/agent",
    });

    expect(webview).toBe(staleWebview);
    const surface = staleHost.firstElementChild as HTMLElement;
    expect(Array.from(surface.children)).toEqual([staleWebview]);
    expectPermanentHostParking(staleHost);
    expectParkedSurface(surface);
    expectResidentWebviewParking(staleWebview);
  });

  it("parks resident webviews as an overlapping stack", () => {
    const firstWebview = ensureTestBrowser({
      browserId: "browser-first",
      workspaceId: "workspace-stack",
      url: "https://example.com/first",
    });
    const secondWebview = ensureTestBrowser({
      browserId: "browser-second",
      workspaceId: "workspace-stack",
      url: "https://example.com/second",
    });

    const host = residentHost();
    expect(firstWebview?.parentElement?.parentElement).toBe(host);
    expect(secondWebview?.parentElement?.parentElement).toBe(host);
    expect(firstWebview?.parentElement).not.toBe(secondWebview?.parentElement);
    expectResidentWebviewParking(firstWebview as HTMLElement);
    expectResidentWebviewParking(secondWebview as HTMLElement);
  });

  it("returns a resident webview without detaching it from its permanent surface", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-visible",
      workspaceId: "workspace-visible",
      url: "https://example.com",
    });

    const permanentParent = webview?.parentElement;
    const visibleWebview = takeResidentBrowserWebview("browser-visible");

    expect(visibleWebview).toBe(webview);
    expect(webview?.parentElement).toBe(permanentParent);
    expect(takeResidentBrowserWebview("browser-visible")).toBe(webview);
  });

  it("applies an exact fixed viewport without a flex width override", () => {
    const webview = document.createElement("webview");
    const { anchor, clip } = mountPane({ left: 0, top: 0, width: 640, height: 480 });

    presentBrowserWebview("browser-fixed", webview, anchor, clip, {
      mode: "fixed",
      width: 640,
      height: 480,
    });

    expect(webview.style.flex).toBe("0 0 auto");
    expect(webview.style.width).toBe("640px");
    expect(webview.style.height).toBe("480px");
  });

  it("parks a browser at its last resolved viewport dimensions", () => {
    const visibleHost = document.createElement("div");
    const webview = document.createElement("webview");
    visibleHost.appendChild(webview);
    document.body.appendChild(visibleHost);
    rememberBrowserWebviewSize({ browserId: "browser-sized", width: 640, height: 480 });

    releaseResidentBrowserWebview("browser-sized", webview);

    expect(webview.style.width).toBe("640px");
    expect(webview.style.height).toBe("480px");
  });

  it("keeps an inactive in-place browser at its last resolved viewport dimensions", () => {
    const webview = document.createElement("webview");
    rememberBrowserWebviewSize({ browserId: "browser-inactive", width: 640, height: 480 });

    applyInactiveBrowserWebviewViewport("browser-inactive", webview, { mode: "responsive" });

    expect(webview.style.flex).toBe("0 0 auto");
    expect(webview.style.width).toBe("640px");
    expect(webview.style.height).toBe("480px");
  });

  it("parks a cold inactive browser at its canonical fixed viewport", () => {
    const webview = document.createElement("webview");

    applyInactiveBrowserWebviewViewport("browser-restored-fixed", webview, {
      mode: "fixed",
      width: 800,
      height: 600,
    });

    expect(webview.style.width).toBe("800px");
    expect(webview.style.height).toBe("600px");
  });

  it("returns an existing visible pane webview instead of creating a resident duplicate", () => {
    const visibleHost = document.createElement("div");
    const visibleWebview = document.createElement("webview");
    prepareTestBrowser(visibleWebview, {
      browserId: "browser-visible-pane",
      workspaceId: "workspace-visible-pane",
      initialUrl: "https://example.com",
    });
    visibleHost.appendChild(visibleWebview);
    document.body.appendChild(visibleHost);

    const webview = ensureTestBrowser({
      browserId: "browser-visible-pane",
      workspaceId: "workspace-visible-pane",
      url: "https://example.com/agent",
    });

    expect(webview).toBe(visibleWebview);
    expect(document.getElementById(RESIDENT_HOST_ID)).toBeNull();
  });

  it("finds the originating browser webview for focus restoration", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-focus",
      workspaceId: "workspace-focus",
      url: "https://example.com",
    });

    setCommandCenterFocusRestoreElement(getResidentBrowserWebview("browser-focus"));

    expect(takeCommandCenterFocusRestoreElement()).toBe(webview);

    expect(getResidentBrowserWebview("browser-missing")).toBeNull();
  });

  it("removes a resident webview when its browser tab closes", () => {
    const webview = ensureTestBrowser({
      browserId: "browser-closed",
      workspaceId: "workspace-closed",
      url: "https://example.com",
    });

    removeResidentBrowserWebview("browser-closed");

    expect(webview?.isConnected).toBe(false);
    expect(takeResidentBrowserWebview("browser-closed")).toBeNull();
  });
});
