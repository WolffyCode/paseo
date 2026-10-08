import { describe, expect, it } from "vitest";
import { isNewWorkspaceScreenActive } from "./screen-presence";

describe("isNewWorkspaceScreenActive", () => {
  it("does not let an older creation navigate over a newer conversation draft", () => {
    expect(
      isNewWorkspaceScreenActive({
        isMounted: true,
        pathname: "/new",
        draftId: "older",
        activeDraftId: "newer",
      }),
    ).toBe(false);
    expect(
      isNewWorkspaceScreenActive({
        isMounted: true,
        pathname: "/new",
        draftId: "newer",
        activeDraftId: "newer",
      }),
    ).toBe(true);
  });
  it("is active while the screen is mounted and the route is /new", () => {
    expect(
      isNewWorkspaceScreenActive({
        draftId: null,
        activeDraftId: null,
        isMounted: true,
        pathname: "/new",
      }),
    ).toBe(true);
  });

  it("is inactive once the screen has been popped off the stack", () => {
    expect(
      isNewWorkspaceScreenActive({
        draftId: null,
        activeDraftId: null,
        isMounted: false,
        pathname: "/new",
      }),
    ).toBe(false);
  });

  it("is inactive while another route sits on top of the screen", () => {
    expect(
      isNewWorkspaceScreenActive({
        draftId: null,
        activeDraftId: null,
        isMounted: true,
        pathname: "/settings",
      }),
    ).toBe(false);
  });

  it("is inactive on a workspace route", () => {
    expect(
      isNewWorkspaceScreenActive({
        draftId: null,
        activeDraftId: null,
        isMounted: true,
        pathname: "/host/workspace/wks_1",
      }),
    ).toBe(false);
  });
});
