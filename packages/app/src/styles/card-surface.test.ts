import { describe, expect, it } from "vitest";
import { CARD_RADIUS } from "./card-surface";

// CARD_RADIUS is the one shared source for the floating-card radius — both the home-shell region
// cards and the workspace split panes read it, so adjacent cards (e.g. the conversation and the
// right tool panel) round identically. Guards the CodePilot darwin value (globals.css) against an
// accidental drift that would desync the two card families.
describe("card surface", () => {
  it("uses CodePilot's 14px floating-card radius", () => {
    expect(CARD_RADIUS).toBe(14);
  });
});
