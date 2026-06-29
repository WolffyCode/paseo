import { autorun, reaction } from "mobx";
import { describe, expect, it } from "vitest";
import type { ThemeName } from "@/styles/theme";
import {
  resolveThemeScheme,
  SHELL_TOKENS,
  THEME_SCHEME,
  ThemeModel,
  type ThemeScheme,
} from "./theme-model";

// resolveThemeScheme is the model-level root-cause fix for the /home crash: scheme is
// computed from the app's own state (the chosen theme + the system scheme), never read
// off a style-factory `colorScheme` discriminant that can be undefined mid-hydration.
describe("resolveThemeScheme", () => {
  // "auto" follows the live system scheme; a null system scheme (pre-hydration on web)
  // collapses to light so the shell always has a defined scheme — the anti-crash floor.
  it("follows the system scheme when the theme is auto", () => {
    expect(resolveThemeScheme("auto", "light")).toBe("light");
    expect(resolveThemeScheme("auto", "dark")).toBe("dark");
    expect(resolveThemeScheme("auto", null)).toBe("light");
  });

  // A concrete theme maps to its own fixed scheme via THEME_SCHEME, independent of the
  // system: codePilot + light are light themes; every dark-family theme is dark.
  it("maps a concrete theme to its fixed scheme", () => {
    expect(resolveThemeScheme("codePilot", "dark")).toBe("light");
    expect(resolveThemeScheme("light", "dark")).toBe("light");
    expect(resolveThemeScheme("dark", "light")).toBe("dark");
    expect(resolveThemeScheme("zinc", "light")).toBe("dark");
    expect(resolveThemeScheme("midnight", "light")).toBe("dark");
    expect(resolveThemeScheme("claude", "light")).toBe("dark");
    expect(resolveThemeScheme("ghostty", "light")).toBe("dark");
  });
});

describe("THEME_SCHEME", () => {
  // Every registered ThemeName must have a scheme — a missing entry is exactly the
  // "undefined discriminant" that crashed the shell, so the map must be total.
  it("assigns a scheme to every theme name", () => {
    const names: ThemeName[] = [
      "codePilot",
      "light",
      "dark",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
    ];
    for (const name of names) {
      expect(THEME_SCHEME[name]).toMatch(/^(light|dark)$/);
    }
  });
});

describe("SHELL_TOKENS", () => {
  // The anti-crash invariant: light and dark carry the EXACT same field set (differ in
  // values, not keys). This is the structural reason `themeModel.tokens.X` can never be
  // undefined regardless of scheme — the inverse of the SHELL_COLORS[colorScheme] crash.
  it("light and dark expose identical token keys", () => {
    expect(Object.keys(SHELL_TOKENS.light).sort()).toEqual(Object.keys(SHELL_TOKENS.dark).sort());
  });

  // The tokens carry the shell's own design values (bilinear periwinkle gradient backdrop,
  // opaque cards, codePilot github palette) — self-contained, no app token pull. The light
  // periwinkle corners are the TRUE rendered colours of the design's `--win-backdrop`
  // (ui.html): the diagonal white-glow + periwinkle-glow + 152deg base
  // (#d8e2f1→#cbd8eb→#d5e0f0), sampled per-corner in real Chrome. The bilinear backdrop
  // re-creates that diagonal — bright top-left, deep periwinkle bottom-right — and the flat
  // `backdrop` is the mean of the four corners (the web flash base / native solid).
  it("carries the design's backdrop, gradient corners, and surface values", () => {
    // Flat fallback solid = mean of the four design-rendered corners (web flash base + native).
    expect(SHELL_TOKENS.light.backdrop).toBe("rgb(207, 220, 237)");
    expect(SHELL_TOKENS.dark.backdrop).toBe("#0d1117");
    // The four window corners read straight off the rendered design backdrop: top-left carries
    // the white radial glow (brightest), bottom-right the periwinkle radial (deepest/bluest),
    // the other two sit on the base gradient. Pinned exactly so a tweak can't silently drift them.
    expect(SHELL_TOKENS.light.backdropGradient).toEqual({
      topLeft: "rgb(228, 235, 245)",
      topRight: "rgb(204, 217, 235)",
      bottomLeft: "rgb(204, 217, 235)",
      bottomRight: "rgb(193, 209, 233)",
    });
    // The sidebar rail is an opaque pale cyan-tint; content cards are an opaque solid white (the
    // cards are NOT frosted — they sit solid over the translucent window backdrop, desktop shows
    // through the BACKDROP, never through a card).
    expect(SHELL_TOKENS.light.surfaceSidebar).toBe("rgb(228, 238, 240)");
    expect(SHELL_TOKENS.light.surfaceCard).toBe("rgb(255, 255, 255)");
  });
});

describe("ThemeModel", () => {
  // A fresh model lands on the light scheme (codePilot default) and its tokens point at
  // the light set — the shell renders defined colors from the first frame.
  it("defaults to the light scheme and light tokens", () => {
    const model = new ThemeModel();
    expect(model.scheme).toBe("light");
    expect(model.tokens).toBe(SHELL_TOKENS.light);
  });

  // setScheme is the single write path; flipping it swaps the computed tokens to the
  // matching set. tokens is derived (computed), never a stored copy.
  it("setScheme swaps the computed tokens to the matching set", () => {
    const model = new ThemeModel();
    model.setScheme("dark");
    expect(model.scheme).toBe("dark");
    expect(model.tokens).toBe(SHELL_TOKENS.dark);
    model.setScheme("light");
    expect(model.tokens).toBe(SHELL_TOKENS.light);
  });

  // scheme is genuinely observable: an autorun re-runs when setScheme fires, which is
  // what makes `observer` components repaint on a theme flip.
  it("notifies observers when the scheme changes", () => {
    const model = new ThemeModel();
    const seen: ThemeScheme[] = [];
    const dispose = autorun(() => seen.push(model.scheme));
    model.setScheme("dark");
    model.setScheme("dark"); // idempotent: same value, no extra notification
    model.setScheme("light");
    dispose();
    expect(seen).toEqual(["light", "dark", "light"]);
  });

  // tokens is a cached computed: a reaction on tokens fires once per real scheme change,
  // proving the derivation is reactive (not recomputed on every access without a dep).
  it("recomputes tokens reactively as a computed", () => {
    const model = new ThemeModel();
    let runs = 0;
    const dispose = reaction(
      () => model.tokens,
      () => {
        runs++;
      },
    );
    model.setScheme("dark");
    model.setScheme("light");
    dispose();
    expect(runs).toBe(2);
  });
});
