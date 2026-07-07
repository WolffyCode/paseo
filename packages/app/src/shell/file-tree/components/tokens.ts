// File-tree-specific design constants PLUS the adjacent view-side pure decisions that consume them
// (registered as this file's dual role in architecture §1 — the decisions are extracted here, next to
// their copy/tokens, so they stay unit-testable without a renderer; tests live in tokens.test.ts).
// Constants are sourced from the requirement's ui.html, not the shell token set which carries no
// blue/folder/destructive role. The shell's themeModel.tokens supplies the neutral surfaces (white
// card, hover wash, #eaeef2 selected, border, foreground, muted).

import type { InlineNameError } from "../model/types";

// GitHub blue (ui.html --primary): focus ring, search-hit highlight, result count, spinner.
export const FT_BLUE = "#0969da";
// The folder icon tint (ui.html .fi-folder), both collapsed and open.
export const FT_FOLDER = "#54aeff";
// Destructive red (ui.html --destructive): inline rename/new error border + message.
export const FT_DESTRUCTIVE = "#cf222e";
// Per-depth indent step in px (requirement: each level +14px).
export const INDENT_PER_DEPTH = 14;

// Placeholder shown inside the inline new-name field (sFT8): the empty-state hint lives in the input
// itself, not as an extra row below, so an empty draft never grows the row or shoves the tree up.
export const INLINE_NAME_PLACEHOLDER = "请输入名称";

// Row-level inline-edit error copy keyed by the store's error code (sFT8 "已存在同名文件" etc.). The
// "empty" case maps to the placeholder copy because an empty name surfaces as the in-field hint, not as
// a red error row — only real rejections (duplicate / illegal / reserved) get the red row below.
export const INLINE_ERROR_LABEL: Record<InlineNameError, string> = {
  empty: INLINE_NAME_PLACEHOLDER,
  duplicate: "已存在同名文件",
  "invalid-chars": "名称含非法字符",
  reserved: "该名称被保留",
};

// Whether a tree/search row paints the selected fill (sFT1/sFT3/sFT8): both the selection AND the
// right-click context-menu target read the darker selected fill — sFT8 §1 keeps the right-clicked
// row highlighted until the menu closes, and a selected row stays selected under the menu. Hover is
// NOT decided here: rows have no JS hover state at all — the web CSS :hover rule
// (util/row-hover-css.ts) is the single hover paint path, and highlighted rows opt out of it by
// dropping the data attribute (review 2026-07-07: the earlier JS hover branch was dead code).
export function isRowHighlighted(state: {
  isSelected: boolean;
  isContextTarget: boolean;
}): boolean {
  return state.isSelected || state.isContextTarget;
}

// Whether an inline-editor keypress carries a ⌘/Ctrl modifier (copy/paste/select-all, word nav, etc.).
// True means the row leaves the event entirely to the browser — it only ever acts on a BARE Escape, so
// system clipboard and selection shortcuts work inside the rename/new input (bug: ⌘C/⌘V were dead).
export function isModifiedEditorKey(event: { metaKey?: boolean; ctrlKey?: boolean }): boolean {
  return event.metaKey === true || event.ctrlKey === true;
}
