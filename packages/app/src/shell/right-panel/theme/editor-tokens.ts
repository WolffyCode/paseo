import { resolveSyntaxColors, type SyntaxColors } from "@getpaseo/highlight";
import type { ThemeScheme } from "../../theme/theme-model";

// The code-editor theme tokens, split into two sources exactly as the design decrees:
//   1. EDITOR_TOKENS — the editor CHROME (background / gutter / current line / selection / cursor /
//      change bar + find-match highlight), which FOLLOWS the app chrome scheme (light chrome → light
//      editor, dark chrome → ODPF dark). Surface/highlight values come from ui.html sRS4; scrollbar roles
//      extend that same palette for the gate-3 narrow-panel horizontal-scroll contract.
//   2. editorSyntaxColors — the code SYNTAX highlight, defaulting to One Dark Pro Flat (dark) / One Light
//      (light), sourced from the shared highlighter's "one" palette so read (chat code blocks) and edit
//      share one color source and nothing is re-invented.
// Both are pure data/derivation with zero CodeMirror dependency, so they unit-test in the node env; the
// CM HighlightStyle + EditorView.theme are built from these in the web-only editor surface.

export interface EditorTokens {
  // The editor surface fill — follows the chrome scheme (light chrome → #fafafa, dark chrome → ODPF).
  background: string;
  // Default foreground for plain text runs.
  foreground: string;
  // Resting gutter line-number color (muted).
  lineNumber: string;
  // The active line's row background.
  currentLine: string;
  // The active line's line-number color (brighter than resting).
  currentLineNumber: string;
  // Text selection background.
  selection: string;
  // The caret color.
  cursor: string;
  // The changed-line gutter bar (edited rows) — a success green.
  gutterChange: string;
  // Non-active find matches (soft blue), scheme-independent per ui.html .ematch.
  match: string;
  // The active find match (amber), scheme-independent per ui.html .ematch.cur.
  matchCurrent: string;
  // The active find match's 1px emphasis ring.
  matchCurrentBorder: string;
  // The scrollbar track follows the editor surface rather than the outer app chrome.
  scrollbarTrack: string;
  // The resting scrollbar thumb stays visible without overpowering source text.
  scrollbarThumb: string;
  // The scrollbar thumb brightens on hover so the horizontal affordance is obvious in a narrow panel.
  scrollbarThumbHover: string;
}

// The find-match highlight is one value across both schemes in ui.html (.ematch / .ematch.cur), so both
// token sets share it — keeping the "same key set per scheme" invariant while honoring the single source.
const MATCH = "rgba(97, 175, 239, 0.2)";
const MATCH_CURRENT = "rgba(229, 192, 123, 0.42)";
const MATCH_CURRENT_BORDER = "#e5c07b";

export const EDITOR_TOKENS: Record<ThemeScheme, EditorTokens> = {
  // One Light style (ui.html sRS4 浅 chrome 编辑器 · design token).
  light: {
    background: "#fafafa",
    foreground: "#383a42",
    lineNumber: "#9d9d9f",
    currentLine: "#eaeaeb",
    currentLineNumber: "#383a42",
    selection: "#d3d7de",
    cursor: "#4078f2",
    gutterChange: "#50a14f",
    match: MATCH,
    matchCurrent: MATCH_CURRENT,
    matchCurrentBorder: MATCH_CURRENT_BORDER,
    scrollbarTrack: "#fafafa",
    scrollbarThumb: "#c2c6cc",
    scrollbarThumbHover: "#9d9d9f",
  },
  // One Dark Pro Flat (ui.html sRS4 深 chrome 编辑器 · design token).
  dark: {
    background: "#282c34",
    foreground: "#abb2bf",
    lineNumber: "#495162",
    currentLine: "#2c313a",
    currentLineNumber: "#abb2bf",
    selection: "#3e4451",
    cursor: "#61afef",
    gutterChange: "#98c379",
    match: MATCH,
    matchCurrent: MATCH_CURRENT,
    matchCurrentBorder: MATCH_CURRENT_BORDER,
    scrollbarTrack: "#282c34",
    scrollbarThumb: "#4b5263",
    scrollbarThumbHover: "#5c6370",
  },
};

// The syntax role → color map for the editor, defaulting to the "one" family (One Dark/Light Pro Flat).
// A future settings module can pass a different theme id here; this round the id is fixed.
export function editorSyntaxColors(scheme: ThemeScheme): SyntaxColors {
  return resolveSyntaxColors("one", scheme);
}
