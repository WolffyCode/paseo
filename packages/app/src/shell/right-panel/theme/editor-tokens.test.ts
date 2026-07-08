import { resolveSyntaxColors } from "@getpaseo/highlight";
import { describe, expect, it } from "vitest";
import { EDITOR_TOKENS, editorSyntaxColors } from "./editor-tokens";

// EDITOR_TOKENS carries the editor chrome (background/foreground/current-line/selection/cursor/gutter +
// find-match highlight) per scheme, verbatim from ui.html sRS4's design tokens. It mirrors SHELL_TOKENS'
// shape: light and dark provide the SAME key set with different values, so tokens[scheme].X can never be
// undefined regardless of which chrome scheme is active. editorSyntaxColors is the code-highlight source,
// which must be the shared highlighter's "one" (One Dark/Light Pro Flat) palette — never a re-invented one.

describe("EDITOR_TOKENS", () => {
  it("provides the identical key set for both schemes (no undefined per scheme)", () => {
    expect(Object.keys(EDITOR_TOKENS.light).sort()).toEqual(Object.keys(EDITOR_TOKENS.dark).sort());
  });

  it("carries the ODPF dark chrome verbatim (background/foreground/cursor from ui.html sRS4)", () => {
    expect(EDITOR_TOKENS.dark.background).toBe("#282c34");
    expect(EDITOR_TOKENS.dark.foreground).toBe("#abb2bf");
    expect(EDITOR_TOKENS.dark.currentLine).toBe("#2c313a");
    expect(EDITOR_TOKENS.dark.selection).toBe("#3e4451");
    expect(EDITOR_TOKENS.dark.cursor).toBe("#61afef");
    expect(EDITOR_TOKENS.dark.gutterChange).toBe("#98c379");
  });

  it("carries the One Light chrome verbatim (background/foreground/cursor from ui.html sRS4)", () => {
    expect(EDITOR_TOKENS.light.background).toBe("#fafafa");
    expect(EDITOR_TOKENS.light.foreground).toBe("#383a42");
    expect(EDITOR_TOKENS.light.currentLine).toBe("#eaeaeb");
    expect(EDITOR_TOKENS.light.selection).toBe("#d3d7de");
    expect(EDITOR_TOKENS.light.cursor).toBe("#4078f2");
    expect(EDITOR_TOKENS.light.gutterChange).toBe("#50a14f");
  });

  it("carries scheme-independent find-match highlight tokens (ui.html .ematch)", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(EDITOR_TOKENS[scheme].match).toBe("rgba(97, 175, 239, 0.2)");
      expect(EDITOR_TOKENS[scheme].matchCurrent).toBe("rgba(229, 192, 123, 0.42)");
      expect(EDITOR_TOKENS[scheme].matchCurrentBorder).toBe("#e5c07b");
    }
  });
});

describe("editorSyntaxColors", () => {
  it("resolves the shared highlighter's One Dark Pro Flat palette for dark chrome", () => {
    const colors = editorSyntaxColors("dark");
    expect(colors).toEqual(resolveSyntaxColors("one", "dark"));
    // Spot-check ODPF keyword so a swap to a different theme id is caught.
    expect(colors.keyword).toBe("#c678dd");
    expect(colors.string).toBe("#98c379");
  });

  it("resolves the shared highlighter's One Light palette for light chrome", () => {
    const colors = editorSyntaxColors("light");
    expect(colors).toEqual(resolveSyntaxColors("one", "light"));
    expect(colors.keyword).toBe("#a626a4");
    expect(colors.function).toBe("#4078f2");
  });
});
