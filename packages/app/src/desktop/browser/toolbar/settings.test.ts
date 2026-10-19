import { beforeEach, describe, expect, it } from "vitest";
import {
  homePageAddress,
  isDefaultToolbar,
  pinnedActionsAfterMove,
  useBrowserToolbarSettingsStore,
} from "./settings";

const FRESH_PROFILE = {
  showHomeButton: false,
  showForwardButton: true,
  pinnedActions: [],
  homePage: { isNewTabPage: true, url: "" },
};

describe("browser toolbar settings", () => {
  beforeEach(() => {
    useBrowserToolbarSettingsStore.setState(FRESH_PROFILE);
  });

  it("appends a new pin at the end, as Chrome does", () => {
    const { setActionPinned } = useBrowserToolbarSettingsStore.getState();
    setActionPinned("kActionDevTools", true);
    setActionPinned("kActionPrint", true);
    setActionPinned("kActionDevTools", false);
    setActionPinned("kActionDevTools", true);

    expect(useBrowserToolbarSettingsStore.getState().pinnedActions).toEqual([
      "kActionPrint",
      "kActionDevTools",
    ]);
  });

  it("takes over a Chrome profile's toolbar and homepage, keeping defaults it never set", () => {
    useBrowserToolbarSettingsStore.getState().takeOverChromeToolbar({
      showHomeButton: true,
      homePageIsNewTabPage: false,
      homePage: "https://example.com/",
      showForwardButton: null,
      pinnedActions: ["kActionShowChromeLabs", "kActionDevTools", "kActionDevTools"],
    });

    expect(useBrowserToolbarSettingsStore.getState()).toMatchObject({
      showHomeButton: true,
      showForwardButton: true,
      pinnedActions: ["kActionShowChromeLabs", "kActionDevTools"],
      homePage: { isNewTabPage: false, url: "https://example.com/" },
    });
  });

  it("resets the buttons and keeps the homepage", () => {
    useBrowserToolbarSettingsStore.setState({
      showHomeButton: true,
      showForwardButton: false,
      pinnedActions: ["kActionPrint"],
      homePage: { isNewTabPage: false, url: "https://example.com/" },
    });

    useBrowserToolbarSettingsStore.getState().resetToDefaults();

    expect(useBrowserToolbarSettingsStore.getState()).toMatchObject({
      ...FRESH_PROFILE,
      homePage: { isNewTabPage: false, url: "https://example.com/" },
    });
  });
});

describe("pinnedActionsAfterMove", () => {
  it("moves a shown pin and leaves pins this browser can't show in their slots", () => {
    const pinnedActions = [
      "kActionPrint",
      "kActionShowChromeLabs",
      "kActionCopyUrl",
      "kActionDevTools",
    ];

    expect(pinnedActionsAfterMove(pinnedActions, "kActionDevTools", 0)).toEqual([
      "kActionDevTools",
      "kActionShowChromeLabs",
      "kActionPrint",
      "kActionCopyUrl",
    ]);
    expect(pinnedActionsAfterMove(pinnedActions, "kActionPrint", 9)).toEqual([
      "kActionCopyUrl",
      "kActionShowChromeLabs",
      "kActionDevTools",
      "kActionPrint",
    ]);
  });

  it("leaves the list alone for an action that isn't pinned", () => {
    expect(pinnedActionsAfterMove(["kActionPrint"], "kActionDevTools", 0)).toEqual([
      "kActionPrint",
    ]);
  });
});

describe("isDefaultToolbar", () => {
  it("counts only the pins this browser shows", () => {
    expect(isDefaultToolbar({ ...FRESH_PROFILE, pinnedActions: ["kActionShowChromeLabs"] })).toBe(
      true,
    );
    expect(isDefaultToolbar({ ...FRESH_PROFILE, pinnedActions: ["kActionPrint"] })).toBe(false);
    expect(isDefaultToolbar({ ...FRESH_PROFILE, showForwardButton: false })).toBe(false);
  });
});

describe("homePageAddress", () => {
  it("opens the new tab page unless the profile set an address", () => {
    expect(homePageAddress({ isNewTabPage: true, url: "https://example.com/" })).toBeNull();
    expect(homePageAddress({ isNewTabPage: false, url: "  " })).toBeNull();
    expect(homePageAddress({ isNewTabPage: false, url: " example.com " })).toBe("example.com");
  });
});
