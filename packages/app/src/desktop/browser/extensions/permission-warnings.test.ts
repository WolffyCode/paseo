import { describe, expect, it } from "vitest";
import type { DesktopBrowserExtensionPermissionRequest } from "@/desktop/host";
import { extensionPermissionWarnings, extensionSiteAccess } from "./permission-warnings";

function request(
  input: Partial<DesktopBrowserExtensionPermissionRequest>,
): DesktopBrowserExtensionPermissionRequest {
  return {
    apiPermissions: [],
    hostPatterns: [],
    overridesNewTabPage: false,
    homepageUrl: null,
    searchUrl: null,
    startupPageUrl: null,
    ...input,
  };
}

describe("extensionPermissionWarnings", () => {
  it("warns about nothing for permissions Chrome doesn't warn about", () => {
    expect(
      extensionPermissionWarnings(
        request({ apiPermissions: ["storage", "alarms", "contextMenus", "scripting"] }),
      ),
    ).toEqual([]);
  });

  it("shows one all-sites warning that absorbs tabs and specific hosts", () => {
    expect(
      extensionPermissionWarnings(
        request({
          apiPermissions: ["tabs", "topSites"],
          hostPatterns: ["https://a.example/*", "<all_urls>"],
        }),
      ),
    ).toEqual([{ kind: "plain", message: "allHosts" }]);
  });

  it("treats a whole top-level domain as every site", () => {
    expect(extensionPermissionWarnings(request({ hostPatterns: ["*://*.com/*"] }))).toEqual([
      { kind: "plain", message: "allHosts" },
    ]);
  });

  it("lists specific hosts sorted, marking whole domains, and skips non-web schemes", () => {
    expect(
      extensionPermissionWarnings(
        request({
          hostPatterns: [
            "https://*.b.example/*",
            "https://a.example:8443/*",
            "chrome://favicon/*",
            "file:///*",
          ],
        }),
      ),
    ).toEqual([
      {
        kind: "hosts",
        hosts: [
          { host: "b.example", isWholeDomain: true },
          { host: "a.example", isWholeDomain: false },
        ],
      },
    ]);
  });

  it("orders warnings as Chrome does: hosts, new tab page, then API permissions", () => {
    expect(
      extensionPermissionWarnings(
        request({
          apiPermissions: ["bookmarks", "notifications", "tabs"],
          hostPatterns: ["https://a.example/*"],
          overridesNewTabPage: true,
        }),
      ).map((warning) => (warning.kind === "hosts" ? "hosts" : warning.message)),
    ).toEqual(["hosts", "newTabPageOverride", "historyRead", "notifications", "bookmarks"]);
  });

  it("lets history absorb tabs, and tabs plus sessions read history on all devices", () => {
    expect(
      extensionPermissionWarnings(request({ apiPermissions: ["history", "tabs", "favicon"] })),
    ).toEqual([{ kind: "plain", message: "historyWriteOnAllDevices" }]);
    expect(extensionPermissionWarnings(request({ apiPermissions: ["tabs", "sessions"] }))).toEqual([
      { kind: "plain", message: "historyReadOnAllDevices" },
    ]);
  });

  it("combines clipboard read and write into one warning", () => {
    expect(
      extensionPermissionWarnings(request({ apiPermissions: ["clipboardWrite", "clipboardRead"] })),
    ).toEqual([{ kind: "plain", message: "clipboardReadWrite" }]);
  });

  it("names the host a settings override switches to", () => {
    expect(
      extensionPermissionWarnings(
        request({
          homepageUrl: "https://home.example/start",
          searchUrl: "https://search.example/?q={searchTerms}",
        }),
      ),
    ).toEqual([
      { kind: "setting", message: "homepage", value: "home.example" },
      { kind: "setting", message: "searchSettings", value: "search.example" },
    ]);
  });
});

describe("extensionSiteAccess", () => {
  it("reports every site for all-hosts patterns and the hosts otherwise", () => {
    expect(extensionSiteAccess(request({ hostPatterns: ["<all_urls>"] }))).toEqual({
      isAllSites: true,
      hosts: [],
    });
    expect(
      extensionSiteAccess(
        request({ hostPatterns: ["https://b.example/*", "*://*.a.example/*", "chrome://x/*"] }),
      ),
    ).toEqual({ isAllSites: false, hosts: ["*.a.example", "b.example"] });
    expect(extensionSiteAccess(request({}))).toEqual({ isAllSites: false, hosts: [] });
  });
});
