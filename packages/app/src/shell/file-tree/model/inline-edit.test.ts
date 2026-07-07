import { describe, expect, it } from "vitest";
import { validateInlineName } from "./inline-edit";

const noSiblings: ReadonlyArray<{ name: string }> = [];

describe("validateInlineName", () => {
  it("accepts a plain valid name with no conflicting sibling", () => {
    expect(
      validateInlineName({ name: "index.ts", siblings: noSiblings, kind: "new-file" }),
    ).toEqual({ ok: true });
  });

  it("rejects an empty name", () => {
    expect(validateInlineName({ name: "", siblings: noSiblings, kind: "new-file" })).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("rejects a whitespace-only name as empty", () => {
    expect(validateInlineName({ name: "   ", siblings: noSiblings, kind: "new-folder" })).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("rejects a name that duplicates an existing sibling", () => {
    expect(
      validateInlineName({
        name: "index.ts",
        siblings: [{ name: "index.ts" }],
        kind: "new-file",
      }),
    ).toEqual({ ok: false, error: "duplicate" });
  });

  it("matches duplicates case-insensitively (macOS/Windows default filesystems)", () => {
    expect(
      validateInlineName({
        name: "README.md",
        siblings: [{ name: "readme.md" }],
        kind: "new-file",
      }),
    ).toEqual({ ok: false, error: "duplicate" });
  });

  it("rejects a name containing a path separator as invalid-chars", () => {
    expect(
      validateInlineName({ name: "src/index.ts", siblings: noSiblings, kind: "new-file" }),
    ).toEqual({ ok: false, error: "invalid-chars" });
    expect(validateInlineName({ name: "a\\b", siblings: noSiblings, kind: "new-folder" })).toEqual({
      ok: false,
      error: "invalid-chars",
    });
  });

  it("rejects names with filesystem-illegal characters", () => {
    for (const bad of ["a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) {
      expect(validateInlineName({ name: bad, siblings: noSiblings, kind: "rename" })).toEqual({
        ok: false,
        error: "invalid-chars",
      });
    }
  });

  it("rejects '.' and '..' as reserved", () => {
    expect(validateInlineName({ name: ".", siblings: noSiblings, kind: "new-folder" })).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(validateInlineName({ name: "..", siblings: noSiblings, kind: "new-folder" })).toEqual({
      ok: false,
      error: "reserved",
    });
  });

  it("rejects windows reserved device names case-insensitively", () => {
    expect(validateInlineName({ name: "CON", siblings: noSiblings, kind: "new-file" })).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(validateInlineName({ name: "nul", siblings: noSiblings, kind: "new-file" })).toEqual({
      ok: false,
      error: "reserved",
    });
    expect(validateInlineName({ name: "COM1", siblings: noSiblings, kind: "new-file" })).toEqual({
      ok: false,
      error: "reserved",
    });
  });

  it("checks empty before duplicate so an empty name is never reported as a duplicate", () => {
    expect(validateInlineName({ name: "", siblings: [{ name: "" }], kind: "new-file" })).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("accepts a leading-dot name (hidden file) that is otherwise valid", () => {
    expect(
      validateInlineName({ name: ".gitignore", siblings: noSiblings, kind: "new-file" }),
    ).toEqual({ ok: true });
  });

  it("accepts names with spaces and hyphens (the illegal set is path/control chars, not these)", () => {
    expect(
      validateInlineName({ name: "my new-file.ts", siblings: noSiblings, kind: "new-file" }),
    ).toEqual({ ok: true });
  });

  it("accepts renaming to the existing name's casing variant only when no sibling clash", () => {
    expect(
      validateInlineName({ name: "App.tsx", siblings: [{ name: "other.ts" }], kind: "rename" }),
    ).toEqual({ ok: true });
  });
});
