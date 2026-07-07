// Tests for resolveBlurExit — the view-layer decision (§3.10) for what a blur / outside-click does to
// an inline edit. The store owns commitEdit/cancelEdit; this pure helper only picks WHICH of the two a
// blur maps to, by the current editing kind + live error, so the component carries no validation
// branch. (Enter is always commitEdit — the store decides keep-open vs discard there — so Enter needs
// no helper; only blur differs: rename-illegal must RESTORE on blur, not stay open.)

import { describe, expect, test } from "vitest";
import type { Editing } from "../model/types";
import { resolveBlurExit } from "./inline-exit";

describe("resolveBlurExit", () => {
  test("new-*: a legal draft (no error) commits on blur", () => {
    const editing: Editing = {
      kind: "new-file",
      parentPath: ".",
      draftName: "a.ts",
      error: null,
    };
    expect(resolveBlurExit(editing)).toBe("commit");
  });

  test("new-*: an empty draft (error) discards on blur — never silently creates", () => {
    const editing: Editing = {
      kind: "new-folder",
      parentPath: ".",
      draftName: "",
      error: "empty",
    };
    expect(resolveBlurExit(editing)).toBe("cancel");
  });

  test("new-*: an illegal/duplicate draft (error) discards on blur", () => {
    const editing: Editing = {
      kind: "new-file",
      parentPath: ".",
      draftName: "dup.ts",
      error: "duplicate",
    };
    expect(resolveBlurExit(editing)).toBe("cancel");
  });

  test("rename: a legal draft different from the original commits on blur", () => {
    const editing: Editing = {
      kind: "rename",
      targetPath: "old.ts",
      originalName: "old.ts",
      draftName: "new.ts",
      error: null,
    };
    expect(resolveBlurExit(editing)).toBe("commit");
  });

  test("rename: a draft equal to the original restores (cancels) on blur — no rename", () => {
    const editing: Editing = {
      kind: "rename",
      targetPath: "old.ts",
      originalName: "old.ts",
      draftName: "old.ts",
      error: null,
    };
    expect(resolveBlurExit(editing)).toBe("cancel");
  });

  test("rename: an illegal draft (error) restores (cancels) on blur, not keep-open", () => {
    const editing: Editing = {
      kind: "rename",
      targetPath: "old.ts",
      originalName: "old.ts",
      draftName: "bad/name",
      error: "invalid-chars",
    };
    expect(resolveBlurExit(editing)).toBe("cancel");
  });
});
