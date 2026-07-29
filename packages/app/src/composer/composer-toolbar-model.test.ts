import { describe, expect, it } from "vitest";
import { deriveComposerToolbarLayout } from "./composer-toolbar-model";

describe("deriveComposerToolbarLayout", () => {
  it("keeps all available runtime labels in the desktop toolbar", () => {
    expect(
      deriveComposerToolbarLayout({
        isCompact: false,
        hasModel: true,
        hasThinking: true,
        hasMode: true,
        hasFeatures: true,
      }),
    ).toEqual({
      persistent: ["model", "thinking", "mode", "features"],
      overflow: [],
    });
  });

  it("keeps only model persistent on compact layouts and moves every low-frequency control to overflow", () => {
    expect(
      deriveComposerToolbarLayout({
        isCompact: true,
        hasModel: true,
        hasThinking: true,
        hasMode: true,
        hasFeatures: true,
      }),
    ).toEqual({
      persistent: ["model"],
      overflow: ["thinking", "mode", "features"],
    });
  });

  it("does not create empty placeholders for unsupported capabilities", () => {
    expect(
      deriveComposerToolbarLayout({
        isCompact: true,
        hasModel: true,
        hasThinking: false,
        hasMode: false,
        hasFeatures: false,
      }),
    ).toEqual({ persistent: ["model"], overflow: [] });
  });
});
