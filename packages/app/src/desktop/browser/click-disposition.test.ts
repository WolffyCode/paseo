import { describe, expect, it } from "vitest";
import { clickDisposition } from "./click-disposition";

const PLAIN = {
  isMiddleButton: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isMac: true,
};

describe("clickDisposition", () => {
  it("opens in the current tab on a plain click", () => {
    expect(clickDisposition(PLAIN)).toBe("currentTab");
  });

  it("opens a background tab on a middle click or the platform's new-tab modifier", () => {
    expect(clickDisposition({ ...PLAIN, isMiddleButton: true })).toBe("newBackgroundTab");
    expect(clickDisposition({ ...PLAIN, metaKey: true })).toBe("newBackgroundTab");
    expect(clickDisposition({ ...PLAIN, isMac: false, ctrlKey: true })).toBe("newBackgroundTab");
  });

  it("ignores the other platform's modifier", () => {
    expect(clickDisposition({ ...PLAIN, ctrlKey: true })).toBe("currentTab");
    expect(clickDisposition({ ...PLAIN, isMac: false, metaKey: true })).toBe("currentTab");
  });

  it("brings the new tab to the front with Shift", () => {
    expect(clickDisposition({ ...PLAIN, metaKey: true, shiftKey: true })).toBe("newForegroundTab");
    expect(clickDisposition({ ...PLAIN, isMiddleButton: true, shiftKey: true })).toBe(
      "newForegroundTab",
    );
    expect(clickDisposition({ ...PLAIN, shiftKey: true })).toBe("newForegroundTab");
  });

  it("saves to disk on an Alt-click without a tab modifier", () => {
    expect(clickDisposition({ ...PLAIN, altKey: true })).toBe("saveToDisk");
    expect(clickDisposition({ ...PLAIN, altKey: true, shiftKey: true })).toBe("newForegroundTab");
    expect(clickDisposition({ ...PLAIN, altKey: true, metaKey: true })).toBe("newBackgroundTab");
  });
});
