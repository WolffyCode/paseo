import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromeUserDataDirectory, readChromeProfiles } from "./profiles";

describe("chromeUserDataDirectory", () => {
  it("finds Chrome's user data on each desktop platform", () => {
    expect(
      chromeUserDataDirectory({
        platform: "darwin",
        homeDirectory: "/Users/someone",
        localAppData: undefined,
      }),
    ).toBe(path.join("/Users/someone", "Library", "Application Support", "Google", "Chrome"));
    expect(
      chromeUserDataDirectory({
        platform: "linux",
        homeDirectory: "/home/someone",
        localAppData: undefined,
      }),
    ).toBe(path.join("/home/someone", ".config", "google-chrome"));
    expect(
      chromeUserDataDirectory({
        platform: "win32",
        homeDirectory: "C:\\Users\\someone",
        localAppData: undefined,
      }),
    ).toBeNull();
  });
});

describe("readChromeProfiles", () => {
  it("lists the last used profile first, then Chrome's order", () => {
    const localState = {
      profile: {
        info_cache: {
          Default: { name: "工作" },
          "Profile 1": { name: "个人" },
          "Profile 2": { name: "测试" },
        },
        profiles_order: ["Default", "Profile 1", "Profile 2"],
        last_used: "Profile 1",
      },
    };

    expect(readChromeProfiles(localState)).toEqual([
      { directory: "Profile 1", name: "个人" },
      { directory: "Default", name: "工作" },
      { directory: "Profile 2", name: "测试" },
    ]);
  });

  it("names profiles the way Chrome's profile picker does and skips guest and system profiles", () => {
    const localState = {
      profile: {
        info_cache: {
          Default: { name: "您的 Chrome", is_using_default_name: true, gaia_name: "王小明" },
          "Profile 1": { name: "工作", is_using_default_name: false, gaia_given_name: "小明" },
          "Profile 2": { name: "个人", gaia_name: "" },
          "Guest Profile": { name: "访客" },
          "System Profile": { name: "System" },
        },
      },
    };

    expect(readChromeProfiles(localState)).toEqual([
      { directory: "Default", name: "王小明" },
      { directory: "Profile 1", name: "小明 (工作)" },
      { directory: "Profile 2", name: "个人" },
    ]);
  });

  it("names a profile by its folder when Chrome stored no name", () => {
    expect(readChromeProfiles({ profile: { info_cache: { Default: {} } } })).toEqual([
      { directory: "Default", name: "Default" },
    ]);
  });

  it.each([null, {}, { profile: [] }, { profile: { info_cache: "Default" } }])(
    "reads no profiles from %j",
    (localState) => {
      expect(readChromeProfiles(localState)).toEqual([]);
    },
  );
});
