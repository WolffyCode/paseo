import { describe, expect, it } from "vitest";

import { decideBrowserWindowOpenRequest, PendingBrowserWindowOpenRequests } from ".";

describe("browser webview window-open requests", () => {
  it("routes foreground tabs to a Paseo workspace tab", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://example.com/target",
      disposition: "foreground-tab",
      frameName: "_blank",
      features: "",
      hasPostBody: false,
    });

    expect(result).toEqual({
      kind: "workspace-tab",
      url: "https://example.com/target",
      isActive: true,
    });
  });

  it("keeps script-opened windows as real popups", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://login.example.com/signin",
      disposition: "new-window",
      frameName: "oauth",
      features: "width=500,height=600",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it("keeps named windows as real popups without a feature string", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://login.example.com/signin",
      disposition: "new-window",
      frameName: "oauth",
      features: "",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it.each(["noopener", "noreferrer"])(
    "routes a named target with %s to a Paseo workspace tab",
    (features) => {
      const result = decideBrowserWindowOpenRequest({
        url: "https://example.com/target",
        disposition: "new-window",
        frameName: "secure-target",
        features,
        hasPostBody: false,
      });

      expect(result).toEqual({
        kind: "workspace-tab",
        url: "https://example.com/target",
        isActive: true,
      });
    },
  );

  it("routes Shift-clicked links to a Paseo workspace tab", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://example.com/target",
      disposition: "new-window",
      frameName: "",
      features: "",
      hasPostBody: false,
    });

    expect(result).toEqual({
      kind: "workspace-tab",
      url: "https://example.com/target",
      isActive: true,
    });
  });

  it.each(["noopener", "noreferrer", "attributionsrc=https://example.com/register", "popup=false"])(
    "routes non-popup feature %s to a Paseo workspace tab",
    (features) => {
      const result = decideBrowserWindowOpenRequest({
        url: "https://example.com/target",
        disposition: "new-window",
        frameName: "_blank",
        features,
        hasPostBody: false,
      });

      expect(result).toEqual({
        kind: "workspace-tab",
        url: "https://example.com/target",
        isActive: true,
      });
    },
  );

  it("keeps an explicitly requested popup as a real popup", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://login.example.com/signin",
      disposition: "new-window",
      frameName: "_blank",
      features: "noopener,popup=yes",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it("keeps legacy browser-chrome features as a real popup", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://login.example.com/signin",
      disposition: "new-window",
      frameName: "_blank",
      features: "menubar=no,toolbar=no,status=no,scrollbars=no",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it("keeps unknown window features as a real popup", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://login.example.com/signin",
      disposition: "new-window",
      frameName: "_blank",
      features: "dialog=yes",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it("routes an all-enabled browser-chrome request to a Paseo workspace tab", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://example.com/target",
      disposition: "new-window",
      frameName: "_blank",
      features:
        "toolbar=yes,location=yes,menubar=yes,status=yes,scrollbars=yes,resizable=yes,noopener",
      hasPostBody: false,
    });

    expect(result).toEqual({
      kind: "workspace-tab",
      url: "https://example.com/target",
      isActive: true,
    });
  });

  it("keeps POST-backed foreground tabs as real popups", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://example.com/submit",
      disposition: "foreground-tab",
      frameName: "_blank",
      features: "",
      hasPostBody: true,
    });

    expect(result).toEqual({ kind: "popup" });
  });

  it("opens extension pages as tabs", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "chrome-extension://mhloojimgilafopcmlcikiidgbbnelip/options.html",
      disposition: "foreground-tab",
      frameName: "_blank",
      features: "",
      hasPostBody: false,
    });

    expect(result).toEqual({
      kind: "workspace-tab",
      url: "chrome-extension://mhloojimgilafopcmlcikiidgbbnelip/options.html",
      isActive: true,
    });
  });

  it("denies unsupported window-open requests", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "file:///etc/passwd",
      disposition: "new-window",
      frameName: "oauth",
      features: "width=500,height=600",
      hasPostBody: false,
    });

    expect(result).toEqual({ kind: "deny" });
  });
});

describe("background tabs", () => {
  it("opens a ⌘-clicked or middle-clicked link behind its page, as Chrome does", () => {
    const result = decideBrowserWindowOpenRequest({
      url: "https://example.com/target",
      disposition: "background-tab",
      frameName: "",
      features: "",
      hasPostBody: false,
    });

    expect(result).toEqual({
      kind: "workspace-tab",
      url: "https://example.com/target",
      isActive: false,
    });
  });
});

describe("pending browser window-open requests", () => {
  it("holds early workspace-tab requests until browser identity registration", () => {
    const pending = new PendingBrowserWindowOpenRequests();
    pending.add(101, { url: "https://example.com/first", isActive: true });
    pending.add(101, { url: "file:///etc/passwd", isActive: true });
    pending.add(101, { url: "https://example.com/second", isActive: false });

    expect(pending.take(101)).toEqual([
      { url: "https://example.com/first", isActive: true },
      { url: "https://example.com/second", isActive: false },
    ]);
    expect(pending.take(101)).toEqual([]);
  });

  it("drops pending workspace-tab requests when an unregistered guest is destroyed", () => {
    const pending = new PendingBrowserWindowOpenRequests();
    pending.add(202, { url: "https://example.com/target", isActive: true });
    pending.delete(202);

    expect(pending.take(202)).toEqual([]);
  });
});
