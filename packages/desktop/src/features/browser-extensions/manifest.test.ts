import { describe, expect, it } from "vitest";
import { manifestIconPath, readPermissionRequest } from "./manifest.js";

describe("readPermissionRequest", () => {
  it("separates manifest V2 host patterns from API permissions", () => {
    const request = readPermissionRequest({
      permissions: ["tabs", "<all_urls>", "https://*.example.com/*", "storage", { usbDevices: [] }],
    });
    expect(request.apiPermissions).toEqual(["tabs", "storage"]);
    expect(request.hostPatterns).toEqual(["<all_urls>", "https://*.example.com/*"]);
  });

  it("counts host permissions and content script matches as host access, once each", () => {
    const request = readPermissionRequest({
      host_permissions: ["https://a.example/*"],
      content_scripts: [
        { matches: ["https://a.example/*", "https://b.example/*"] },
        { matches: ["https://c.example/*"] },
      ],
    });
    expect(request.hostPatterns).toEqual([
      "https://a.example/*",
      "https://b.example/*",
      "https://c.example/*",
    ]);
  });

  it("reads the new tab page and settings overrides", () => {
    const request = readPermissionRequest({
      chrome_url_overrides: { newtab: "index.html" },
      chrome_settings_overrides: {
        homepage: "https://home.example/",
        search_provider: { search_url: "https://search.example/?q={searchTerms}" },
        startup_pages: ["https://start.example/"],
      },
    });
    expect(request).toMatchObject({
      overridesNewTabPage: true,
      homepageUrl: "https://home.example/",
      searchUrl: "https://search.example/?q={searchTerms}",
      startupPageUrl: "https://start.example/",
    });
  });

  it("asks for nothing when the manifest declares nothing", () => {
    expect(readPermissionRequest({})).toEqual({
      apiPermissions: [],
      hostPatterns: [],
      overridesNewTabPage: false,
      homepageUrl: null,
      searchUrl: null,
      startupPageUrl: null,
    });
  });
});

describe("manifestIconPath", () => {
  const manifest = { icons: { "16": "icon16.png", "48": "icon48.png", "128": "icon128.png" } };

  it("picks the smallest icon that is large enough", () => {
    expect(manifestIconPath(manifest, 32)).toBe("icon48.png");
    expect(manifestIconPath(manifest, 16)).toBe("icon16.png");
  });

  it("falls back to the largest icon", () => {
    expect(manifestIconPath(manifest, 256)).toBe("icon128.png");
  });

  it("has nothing to draw without icons", () => {
    expect(manifestIconPath({}, 32)).toBeNull();
  });
});
