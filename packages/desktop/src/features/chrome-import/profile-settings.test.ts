import { describe, expect, it } from "vitest";
import { readChromeProfileSettings } from "./profile-settings";

// extensions/common/extension.h InitFromValueFlags and manifest.mojom locations, as Chrome writes them.
const FROM_WEBSTORE = 8;
const INSTALLED_BY_DEFAULT = 128;
const INTERNAL = 1;
const UNPACKED = 4;
const COMPONENT = 5;
const POLICY = 9;

describe("readChromeProfileSettings", () => {
  it("reads the toolbar from the file Chrome keeps each pref in", () => {
    const settings = readChromeProfileSettings({
      securePreferences: {
        browser: { show_home_button: true },
        homepage: "https://example.com/",
        homepage_is_newtabpage: false,
      },
      preferences: {
        browser: { show_forward_button: false },
        toolbar: { pinned_actions: ["kActionShowChromeLabs", "kActionDevTools", 3] },
        extensions: { pinned_extensions: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] },
      },
    });

    expect(settings).toMatchObject({
      showHomeButton: true,
      homePage: "https://example.com/",
      homePageIsNewTabPage: false,
      showForwardButton: false,
      pinnedActions: ["kActionShowChromeLabs", "kActionDevTools"],
      pinnedExtensionIds: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    });
  });

  it("prefers a signed-in profile's synced values", () => {
    const settings = readChromeProfileSettings({
      securePreferences: {},
      preferences: {
        toolbar: { pinned_actions: ["kActionPrint"] },
        account_values: { toolbar: { pinned_actions: ["kActionTaskManager", "kActionDevTools"] } },
      },
    });

    expect(settings.pinnedActions).toEqual(["kActionTaskManager", "kActionDevTools"]);
  });

  it("leaves unset prefs at Chrome's defaults", () => {
    expect(readChromeProfileSettings({ preferences: {}, securePreferences: null })).toEqual({
      showHomeButton: null,
      homePageIsNewTabPage: null,
      homePage: null,
      showForwardButton: null,
      pinnedActions: [],
      pinnedExtensionIds: [],
      webStoreExtensions: [],
    });
  });

  it("carries over only turned-on extensions the user installed from the Chrome Web Store", () => {
    const manifest = { name: "Cookie-Editor", version: "1.13.0" };
    const settings = readChromeProfileSettings({
      preferences: {},
      securePreferences: {
        extensions: {
          settings: {
            webstore: {
              location: INTERNAL,
              creation_flags: FROM_WEBSTORE,
              path: "webstore/1.13.0_0",
              manifest,
              disable_reasons: [],
            },
            olderWebstore: { location: INTERNAL, from_webstore: true, state: 1 },
            turnedOff: { location: INTERNAL, creation_flags: FROM_WEBSTORE, disable_reasons: [1] },
            turnedOffBitmask: {
              location: INTERNAL,
              creation_flags: FROM_WEBSTORE,
              disable_reasons: 1,
            },
            preinstalled: {
              location: INTERNAL,
              creation_flags: FROM_WEBSTORE | INSTALLED_BY_DEFAULT,
            },
            crxFile: { location: INTERNAL, creation_flags: 1 },
            component: { location: COMPONENT, creation_flags: 1, from_webstore: false },
            forcedByPolicy: { location: POLICY, creation_flags: FROM_WEBSTORE },
            unpacked: { location: UNPACKED },
          },
        },
      },
    });

    expect(settings.webStoreExtensions).toEqual([
      { id: "webstore", path: "webstore/1.13.0_0", manifest },
      { id: "olderWebstore", path: null, manifest: null },
    ]);
  });

  it("finds extension settings in Preferences where Chrome keeps them there", () => {
    const settings = readChromeProfileSettings({
      securePreferences: null,
      preferences: {
        extensions: {
          settings: { linux: { location: INTERNAL, creation_flags: FROM_WEBSTORE } },
        },
      },
    });

    expect(settings.webStoreExtensions).toEqual([{ id: "linux", path: null, manifest: null }]);
  });
});
