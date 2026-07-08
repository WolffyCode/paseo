import { describe, expect, it } from "vitest";
import { resolveRevealAction } from "./reveal-action";

// The three-branch reveal decision (requirement §3.2 / item 23) — verified purely, no store/render.
// Each branch and the identity edges (null root, prefix trap, target == root, windows separators/case,
// posix case-sensitivity) are pinned so the store can dispatch the right transition every time.
describe("resolveRevealAction", () => {
  it("reveals a deeper descendant in place (under root, parent ≠ root)", () => {
    expect(
      resolveRevealAction({
        targetAbsPath: "/work/project/src/app/index.ts",
        currentRoot: "/work/project",
      }),
    ).toEqual({ action: "reveal" });
  });

  it("only selects a direct child (its directory is exactly the root)", () => {
    expect(
      resolveRevealAction({
        targetAbsPath: "/work/project/readme.md",
        currentRoot: "/work/project",
      }),
    ).toEqual({ action: "select" });
  });

  it("re-roots an out-of-bounds file (not a descendant of the current root)", () => {
    expect(
      resolveRevealAction({ targetAbsPath: "/other/dir/a.ts", currentRoot: "/work/project" }),
    ).toEqual({ action: "reroot" });
  });

  it("re-roots when there is no current root yet (null)", () => {
    expect(resolveRevealAction({ targetAbsPath: "/work/a.ts", currentRoot: null })).toEqual({
      action: "reroot",
    });
  });

  it("re-roots a same-prefix sibling directory rather than being fooled by the string prefix", () => {
    // "/work/project-2" shares the "/work/project" prefix but is NOT under it — must re-root, not reveal.
    expect(
      resolveRevealAction({ targetAbsPath: "/work/project-2/a.ts", currentRoot: "/work/project" }),
    ).toEqual({ action: "reroot" });
  });

  it("re-roots when the target equals the root itself (degenerate, no visible row for it)", () => {
    expect(
      resolveRevealAction({ targetAbsPath: "/work/project", currentRoot: "/work/project" }),
    ).toEqual({ action: "reroot" });
  });

  it("tolerates a trailing separator on the root", () => {
    expect(
      resolveRevealAction({ targetAbsPath: "/work/project/a.ts", currentRoot: "/work/project/" }),
    ).toEqual({ action: "select" });
  });

  it("re-roots a blank/degenerate root", () => {
    expect(resolveRevealAction({ targetAbsPath: "/a.ts", currentRoot: "   " })).toEqual({
      action: "reroot",
    });
  });

  describe("windows-style hosts (backslash + case-insensitive)", () => {
    it("reveals a deeper descendant across backslash separators", () => {
      expect(
        resolveRevealAction({
          targetAbsPath: "C:\\work\\proj\\src\\a.ts",
          currentRoot: "C:\\work\\proj",
        }),
      ).toEqual({ action: "reveal" });
    });

    it("selects a direct child across backslash separators", () => {
      expect(
        resolveRevealAction({
          targetAbsPath: "C:\\work\\proj\\a.ts",
          currentRoot: "C:\\work\\proj",
        }),
      ).toEqual({ action: "select" });
    });

    it("folds case for a windows direct child", () => {
      expect(
        resolveRevealAction({
          targetAbsPath: "C:\\Work\\Proj\\A.TS",
          currentRoot: "c:\\work\\proj",
        }),
      ).toEqual({ action: "select" });
    });

    it("folds case for a windows deeper descendant", () => {
      expect(
        resolveRevealAction({
          targetAbsPath: "C:\\WORK\\PROJ\\SRC\\a.ts",
          currentRoot: "c:\\work\\proj",
        }),
      ).toEqual({ action: "reveal" });
    });

    it("normalizes mixed separators (backslash root, forward-slash target)", () => {
      expect(
        resolveRevealAction({ targetAbsPath: "C:/work/proj/a.ts", currentRoot: "C:\\work\\proj" }),
      ).toEqual({ action: "select" });
    });
  });

  it("keeps posix comparisons case-sensitive (a case-different directory is out of bounds)", () => {
    // On posix "/work/Project" ≠ "/work/project" — genuinely different dirs, so re-root, never reveal.
    expect(
      resolveRevealAction({ targetAbsPath: "/work/Project/a.ts", currentRoot: "/work/project" }),
    ).toEqual({ action: "reroot" });
  });
});
