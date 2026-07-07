// Tests for tokens.ts's pure view decisions (extracted there so they stay node-testable without
// rendering the RN component). Both keep tree-node.tsx a dispatcher — the row reads these, it does
// not branch.
//
// isRowHighlighted encodes sFT1/sFT3/sFT8: the selection AND the right-click target both read the
// darker selected fill (sFT8 §1 "被右键的行保持高亮 #eaeef2 直到菜单关闭"). Hover is deliberately
// NOT part of this decision — the web CSS :hover rule (util/row-hover-css.ts) is the single hover
// paint path (review 2026-07-07 removed the dead JS hover branch).
//
// isModifiedEditorKey gates bug #3: with ⌘/Ctrl held (copy/paste/select-all/etc.) the row must NOT
// touch the event — only a bare Escape is the row's to act on, everything else reaches the browser.

import { describe, expect, test } from "vitest";
import { isModifiedEditorKey, isRowHighlighted } from "./tokens";

describe("isRowHighlighted", () => {
  test("a selected row is highlighted", () => {
    expect(isRowHighlighted({ isSelected: true, isContextTarget: false })).toBe(true);
  });

  test("the right-click context-menu target is highlighted (sFT8 §1)", () => {
    expect(isRowHighlighted({ isSelected: false, isContextTarget: true })).toBe(true);
  });

  test("an idle row is not highlighted (its hover wash comes from CSS alone)", () => {
    expect(isRowHighlighted({ isSelected: false, isContextTarget: false })).toBe(false);
  });
});

describe("isModifiedEditorKey", () => {
  test("⌘C / ⌘V / ⌘A (metaKey) are modified — the row must not intercept them", () => {
    expect(isModifiedEditorKey({ metaKey: true })).toBe(true);
  });

  test("Ctrl combos (ctrlKey) are modified — left to the browser for copy/paste/select", () => {
    expect(isModifiedEditorKey({ ctrlKey: true })).toBe(true);
  });

  test("a bare key (no modifier) is not modified — the row may act on Escape", () => {
    expect(isModifiedEditorKey({})).toBe(false);
    expect(isModifiedEditorKey({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});
