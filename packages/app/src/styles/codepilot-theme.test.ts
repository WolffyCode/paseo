import { describe, expect, it } from "vitest";
import {
  THEME_SWATCHES,
  THEME_TO_UNISTYLES,
  codePilotDark,
  codePilotLight,
  lightTheme,
} from "./theme";

// Guards the codePilot theme contract. The #1 past failure was selection rendering
// as black/charcoal instead of GitHub's very-light-gray — these assertions make
// that regression impossible to land silently.
describe("codePilot theme tokens", () => {
  it("registers codePilot in the theme-name map and swatch list", () => {
    expect(THEME_TO_UNISTYLES.codePilot).toBe("codePilotLight");
    expect(THEME_SWATCHES.codePilot).toBeDefined();
  });

  it("light and dark each carry the full semantic color contract — no missing keys", () => {
    const contract = Object.keys(lightTheme.colors).sort();
    expect(Object.keys(codePilotLight.colors).sort()).toEqual(contract);
    expect(Object.keys(codePilotDark.colors).sort()).toEqual(contract);
  });

  it("uses GitHub light neutrals — white surface, near-black text, light-gray border", () => {
    expect(codePilotLight.colors.surface0).toBe("#ffffff");
    expect(codePilotLight.colors.foreground).toBe("#1f2328");
    expect(codePilotLight.colors.border).toBe("#d1d9e0");
    expect(codePilotLight.colorScheme).toBe("light");
  });

  it("selection/hover is a very light gray (#eaeef2) — never black, never the accent", () => {
    expect(codePilotLight.colors.surfaceSidebarHover).toBe("#eaeef2");
    expect(codePilotLight.colors.secondaryForeground).toBe("#3d444d");
    expect(codePilotLight.colors.surfaceSidebarHover).not.toBe(codePilotLight.colors.accent);
    expect(codePilotLight.colors.surfaceSidebarHover).not.toBe("#000000");
  });

  it("accent and primary are GitHub blue (highlight only, not a near-black fill)", () => {
    expect(codePilotLight.colors.accent).toBe("#0969da");
    expect(codePilotLight.colors.primary).toBe("#0969da");
  });

  it("ships a GitHub dark variant — deep navy surface, near-white text, gray selection", () => {
    expect(codePilotDark.colors.surface0).toBe("#0d1117");
    expect(codePilotDark.colors.foreground).toBe("#e6edf3");
    expect(codePilotDark.colors.surfaceSidebarHover).toBe("#21262d");
    expect(codePilotDark.colorScheme).toBe("dark");
  });

  it("adds the shell vibrancy tokens consumed only by the home shell", () => {
    expect(codePilotLight.colors.surfaceShell).toBeDefined();
    expect(codePilotLight.colors.sidebarTranslucent).toBeDefined();
    expect(codePilotDark.colors.surfaceShell).toBeDefined();
    expect(codePilotDark.colors.sidebarTranslucent).toBeDefined();
  });
});
