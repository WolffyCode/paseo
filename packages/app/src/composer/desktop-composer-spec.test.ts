import { describe, expect, it } from "vitest";
import { DESKTOP_COMPOSER_METRICS, getDesktopRuntimePopoverSpec } from "./desktop-composer-spec";

describe("desktop Composer design contract", () => {
  it("keeps the approved surface geometry stable", () => {
    expect(DESKTOP_COMPOSER_METRICS).toMatchObject({
      maxWidth: 760,
      sectionGap: 9,
      inputRadius: 16,
      editorMinHeight: 116,
      textareaMinHeight: 84,
      footerMinHeight: 48,
      actionSize: 34,
      runtimeMinHeight: 46,
      runtimeRadius: 16,
      runtimeControlHeight: 32,
      runtimePopoverOffset: 14,
      runtimePopoverRadius: 14,
    });
  });

  it("anchors the model from the left and right-side controls from the right", () => {
    expect(getDesktopRuntimePopoverSpec("model")).toEqual({
      width: 345,
      placement: "top-start",
      offset: 14,
    });
    expect(getDesktopRuntimePopoverSpec("reasoning")).toEqual({
      width: 250,
      placement: "top-end",
      offset: 14,
    });
    expect(getDesktopRuntimePopoverSpec("mode")).toEqual({
      width: 270,
      placement: "top-end",
      offset: 14,
    });
    expect(getDesktopRuntimePopoverSpec("context")).toEqual({
      width: 260,
      placement: "top-end",
      offset: 14,
    });
  });
});
