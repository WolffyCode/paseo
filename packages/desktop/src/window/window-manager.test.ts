import { describe, expect, it, vi } from "vitest";

import {
  applyWindowControlsOverlayUpdate,
  createWindowControlsOverlayState,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getMainWindowChromeOptions,
  getTitleBarOverlayOptions,
  getWindowSurfaceOptions,
  readBadgeCount,
  readWindowControlsOverlayUpdate,
  readWindowTheme,
  resolveRuntimeTitleBarOverlayOptions,
  resolveWindowBounds,
} from "./window-manager";

describe("window-manager", () => {
  describe("readBadgeCount", () => {
    it("returns valid non-negative integers", () => {
      expect(readBadgeCount(0)).toBe(0);
      expect(readBadgeCount(3)).toBe(3);
    });

    it("falls back to zero for invalid payloads", () => {
      expect(readBadgeCount(undefined)).toBe(0);
      expect(readBadgeCount(null)).toBe(0);
      expect(readBadgeCount(Number.NaN)).toBe(0);
      expect(readBadgeCount(Number.POSITIVE_INFINITY)).toBe(0);
      expect(readBadgeCount(-1)).toBe(0);
      expect(readBadgeCount(1.5)).toBe(0);
      expect(readBadgeCount("2")).toBe(0);
      expect(readBadgeCount({ count: 2 })).toBe(0);
    });
  });

  describe("readWindowTheme", () => {
    it("accepts supported title bar themes", () => {
      expect(readWindowTheme("light")).toBe("light");
      expect(readWindowTheme("dark")).toBe("dark");
    });

    it("rejects invalid title bar themes", () => {
      expect(readWindowTheme(undefined)).toBeNull();
      expect(readWindowTheme("auto")).toBeNull();
      expect(readWindowTheme("system")).toBeNull();
    });
  });

  describe("getTitleBarOverlayOptions", () => {
    it("returns light title bar overlay colors", () => {
      expect(getTitleBarOverlayOptions("light")).toEqual({
        color: "#ffffff",
        symbolColor: "#09090b",
        height: 29,
      });
    });

    it("returns dark title bar overlay colors", () => {
      expect(getTitleBarOverlayOptions("dark")).toEqual({
        color: "#181B1A",
        symbolColor: "#e4e4e7",
        height: 29,
      });
    });
  });

  describe("readWindowControlsOverlayUpdate", () => {
    it("accepts partial runtime overlay updates", () => {
      expect(
        readWindowControlsOverlayUpdate({
          height: 48,
          backgroundColor: "#181B1A",
        }),
      ).toEqual({
        height: 48,
        backgroundColor: "#181B1A",
      });
    });

    it("rejects empty and invalid payloads", () => {
      expect(readWindowControlsOverlayUpdate(undefined)).toBeNull();
      expect(readWindowControlsOverlayUpdate({})).toBeNull();
      expect(readWindowControlsOverlayUpdate({ height: 0 })).toBeNull();
      expect(readWindowControlsOverlayUpdate({ backgroundColor: 12 })).toBeNull();
    });
  });

  describe("resolveRuntimeTitleBarOverlayOptions", () => {
    it("applies the VS Code height minus border adjustment", () => {
      expect(
        resolveRuntimeTitleBarOverlayOptions({
          height: 48,
          backgroundColor: "#ffffff",
          foregroundColor: "#09090b",
        }),
      ).toEqual({
        color: "#ffffff",
        symbolColor: "#09090b",
        height: 47,
      });
    });
  });

  describe("applyWindowControlsOverlayUpdate", () => {
    it("merges cached colors with later runtime height updates", () => {
      const setTitleBarOverlay = vi.fn();
      let state = createWindowControlsOverlayState("dark");

      state = applyWindowControlsOverlayUpdate({
        win: { setTitleBarOverlay },
        current: state,
        update: {
          backgroundColor: "#181B1A",
          foregroundColor: "#e4e4e7",
        },
      });

      state = applyWindowControlsOverlayUpdate({
        win: { setTitleBarOverlay },
        current: state,
        update: { height: 48 },
      });

      expect(state).toEqual({
        height: 48,
        backgroundColor: "#181B1A",
        foregroundColor: "#e4e4e7",
      });
      expect(setTitleBarOverlay).toHaveBeenNthCalledWith(1, {
        color: "#181B1A",
        symbolColor: "#e4e4e7",
        height: 28,
      });
      expect(setTitleBarOverlay).toHaveBeenNthCalledWith(2, {
        color: "#181B1A",
        symbolColor: "#e4e4e7",
        height: 47,
      });
    });
  });

  describe("getMainWindowChromeOptions", () => {
    it("uses frameless hidden title bars with overlay on windows", () => {
      expect(
        getMainWindowChromeOptions({
          platform: "win32",
          theme: "dark",
        }),
      ).toEqual({
        titleBarStyle: "hidden",
        frame: false,
        autoHideMenuBar: true,
        titleBarOverlay: {
          color: "#181B1A",
          symbolColor: "#e4e4e7",
          height: 29,
        },
      });
    });

    it("uses frameless hidden title bars with overlay on linux", () => {
      expect(
        getMainWindowChromeOptions({
          platform: "linux",
          theme: "light",
        }),
      ).toEqual({
        titleBarStyle: "hidden",
        frame: false,
        autoHideMenuBar: true,
        titleBarOverlay: {
          color: "#ffffff",
          symbolColor: "#09090b",
          height: 29,
        },
      });
    });

    it("uses hiddenInset + CodePilot traffic-light position on mac (no overlay — the transparent vibrancy window draws its own chrome)", () => {
      expect(
        getMainWindowChromeOptions({
          platform: "darwin",
          theme: "dark",
        }),
      ).toEqual({
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 20, y: 21 },
      });
    });
  });

  describe("getWindowSurfaceOptions", () => {
    it("returns a transparent vibrancy surface on mac so the NSVisualEffectView shows through the gutters", () => {
      expect(getWindowSurfaceOptions("darwin", "light")).toEqual({
        // '#00ffffff' (white rgb, alpha 0), not '#00000000' — Electron's macOS color
        // parser treats rgb=0/alpha=0 as opaque white (issue #20357).
        backgroundColor: "#00ffffff",
        vibrancy: "menu",
        transparent: true,
        visualEffectState: "followWindow",
      });
    });

    it("does not vary the mac vibrancy surface by renderer theme — the OS drives the material", () => {
      expect(getWindowSurfaceOptions("darwin", "dark")).toEqual(
        getWindowSurfaceOptions("darwin", "light"),
      );
    });

    it("keeps a solid opaque backdrop off mac (no vibrancy/transparency)", () => {
      expect(getWindowSurfaceOptions("win32", "dark")).toEqual({ backgroundColor: "#181B1A" });
      expect(getWindowSurfaceOptions("linux", "light")).toEqual({ backgroundColor: "#ffffff" });
    });
  });

  describe("resolveWindowBounds", () => {
    it("falls back to the default size when no state is saved", () => {
      expect(resolveWindowBounds(null)).toEqual({
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
      });
    });

    it("restores the full size and position", () => {
      expect(
        resolveWindowBounds({ x: 120, y: 80, width: 1024, height: 720, isMaximized: false }),
      ).toEqual({ width: 1024, height: 720, x: 120, y: 80 });
    });

    it("omits the position when only the size was persisted", () => {
      expect(resolveWindowBounds({ width: 1024, height: 720, isMaximized: true })).toEqual({
        width: 1024,
        height: 720,
      });
    });
  });
});
