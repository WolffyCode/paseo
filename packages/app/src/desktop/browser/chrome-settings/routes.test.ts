import { describe, expect, it } from "vitest";
import {
  CLEAR_BROWSER_DATA_ROUTE,
  IMPORT_DATA_ROUTE,
  resolveSettingsRoute,
  settingsSectionRoute,
  settingsSubpageRoute,
  SETTINGS_SECTIONS,
} from "./routes";

const onSection = { subpage: null, dialog: null, isBasicPage: false };

describe("resolveSettingsRoute", () => {
  it("shows the section a route names", () => {
    expect(resolveSettingsRoute("/privacy")).toEqual({ ...onSection, section: "privacy" });
    expect(resolveSettingsRoute("/people")).toEqual({ ...onSection, section: "people" });
    expect(resolveSettingsRoute("/help")).toEqual({ ...onSection, section: "about" });
  });

  it("opens a subpage in place of its section", () => {
    expect(resolveSettingsRoute("/manageProfile")).toEqual({
      ...onSection,
      section: "people",
      subpage: "manageProfile",
    });
  });

  it("opens a dialog over its section", () => {
    expect(resolveSettingsRoute(CLEAR_BROWSER_DATA_ROUTE)).toEqual({
      ...onSection,
      section: "privacy",
      dialog: "clearBrowserData",
    });
    expect(resolveSettingsRoute("/resetProfileSettings")).toEqual({
      ...onSection,
      section: "reset",
      dialog: "resetProfileSettings",
    });
    expect(resolveSettingsRoute(IMPORT_DATA_ROUTE)).toEqual({
      ...onSection,
      section: "people",
      dialog: "importData",
    });
  });

  it("shows the first section, 我与 Google, for the settings page itself and unknown routes", () => {
    const basicPage = { ...onSection, section: "people", isBasicPage: true };
    expect(resolveSettingsRoute("/")).toEqual(basicPage);
    expect(resolveSettingsRoute("/autofill")).toEqual(basicPage);
  });

  it("gives every section and subpage a route that resolves back to it", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(resolveSettingsRoute(settingsSectionRoute(section)).section).toBe(section);
    }
    expect(resolveSettingsRoute(settingsSubpageRoute("manageProfile")).subpage).toBe(
      "manageProfile",
    );
  });
});
