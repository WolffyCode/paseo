import { describe, expect, it } from "vitest";
import {
  joinHostPath,
  normalizeFileLocation,
  relativeHostPath,
  sameFilePath,
} from "./file-location";

// file-location is the shell's own file-position value + identity, equivalently rewritten from the
// legacy @/workspace/file-open (no cross-directory import). These tests pin the two contracts the
// right panel leans on: normalization (a single canonical path/line shape) and path-only identity
// (Windows case-insensitive), so tab dedup can never split one file across two tabs.

describe("normalizeFileLocation · path", () => {
  // Surrounding whitespace is user/transport noise, never part of the file's identity.
  it("trims surrounding whitespace", () => {
    expect(normalizeFileLocation({ path: "  src/a.ts  " }).path).toBe("src/a.ts");
  });

  // Windows-style backslashes are folded to forward slashes so one file has one path spelling.
  it("converts backslashes to forward slashes", () => {
    expect(normalizeFileLocation({ path: "src\\dir\\a.ts" }).path).toBe("src/dir/a.ts");
  });

  // Empty and "." segments carry no meaning; collapsing them keeps "./a//b" and "a/b" identical.
  it("drops empty and dot path segments", () => {
    expect(normalizeFileLocation({ path: "./src//dir/./a.ts" }).path).toBe("src/dir/a.ts");
  });

  // A leading slash marks an absolute path and must survive normalization.
  it("preserves a leading slash for absolute paths", () => {
    expect(normalizeFileLocation({ path: "/src/./a.ts" }).path).toBe("/src/a.ts");
  });

  // ".." is a real path segment (not resolved here) — normalization must not silently collapse it.
  it("keeps parent (..) segments intact", () => {
    expect(normalizeFileLocation({ path: "src/../a.ts" }).path).toBe("src/../a.ts");
  });
});

describe("normalizeFileLocation · line numbers", () => {
  // A location with no lines is the common case (open the file, no scroll target); the keys stay absent.
  it("leaves both line numbers undefined when not provided", () => {
    const loc = normalizeFileLocation({ path: "a.ts" });
    expect("lineStart" in loc).toBe(false);
    expect("lineEnd" in loc).toBe(false);
  });

  // Lines are 1-based positive integers: zero/negative clamp up to 1, fractions floor to an integer.
  it("clamps lineStart to a positive integer", () => {
    expect(normalizeFileLocation({ path: "a.ts", lineStart: 0 }).lineStart).toBe(1);
    expect(normalizeFileLocation({ path: "a.ts", lineStart: -3 }).lineStart).toBe(1);
    expect(normalizeFileLocation({ path: "a.ts", lineStart: 2.9 }).lineStart).toBe(2);
  });

  // An end before the start is nonsense; it is raised to the start so the range is never inverted.
  it("raises lineEnd to be at least lineStart", () => {
    const loc = normalizeFileLocation({ path: "a.ts", lineStart: 5, lineEnd: 2 });
    expect(loc.lineStart).toBe(5);
    expect(loc.lineEnd).toBe(5);
  });

  // A well-formed range floors both ends and keeps end when it already exceeds start.
  it("floors a fractional range and keeps a valid end", () => {
    const loc = normalizeFileLocation({ path: "a.ts", lineStart: 3.6, lineEnd: 9.9 });
    expect(loc.lineStart).toBe(3);
    expect(loc.lineEnd).toBe(9);
  });
});

describe("sameFilePath", () => {
  // Identity is path-only; two spellings of the same file are the same identity.
  it("is true for identical paths", () => {
    expect(sameFilePath("src/a.ts", "src/a.ts")).toBe(true);
  });

  // Slash direction and redundant segments are normalized away before comparison.
  it("is true across slash direction and dot segments", () => {
    expect(sameFilePath("src\\a.ts", "./src/a.ts")).toBe(true);
  });

  // Windows filesystems are case-insensitive, so identity ignores case — one file, one tab.
  it("is true across case differences (Windows-insensitive)", () => {
    expect(sameFilePath("Src/App.TS", "src/app.ts")).toBe(true);
  });

  // Genuinely different files stay distinct so their tabs never collapse.
  it("is false for different files", () => {
    expect(sameFilePath("src/a.ts", "src/b.ts")).toBe(false);
  });
});

describe("joinHostPath", () => {
  // A root-relative path joins under the root with a single separator (the common tree→abs case).
  it("joins a relative path under the root", () => {
    expect(joinHostPath("/host/proj", "src/a.ts")).toBe("/host/proj/src/a.ts");
  });

  // A trailing separator on the root collapses to one at the seam.
  it("collapses a trailing-slash root at the seam", () => {
    expect(joinHostPath("/host/proj/", "src/a.ts")).toBe("/host/proj/src/a.ts");
  });

  // The tree root itself ("." or "") resolves to the root.
  it("resolves the tree root to the root", () => {
    expect(joinHostPath("/host/proj", ".")).toBe("/host/proj");
    expect(joinHostPath("/host/proj", "")).toBe("/host/proj");
  });

  // An already-absolute or home-relative path is passed through untouched.
  it("passes an absolute or home path through", () => {
    expect(joinHostPath("/host/proj", "/etc/hosts")).toBe("/etc/hosts");
    expect(joinHostPath("/host/proj", "~/Desktop/a.ts")).toBe("~/Desktop/a.ts");
  });

  // Windows backslashes fold to forward slashes so the joined path has one spelling.
  it("folds backslashes before joining", () => {
    expect(joinHostPath("/host/proj", "src\\a.ts")).toBe("/host/proj/src/a.ts");
  });
});

describe("relativeHostPath", () => {
  // The inverse of joinHostPath: strip the root prefix so the file-tab model can derive the root-relative
  // path its IO wants from the absolute identity path the right panel dedups on.
  it("strips the root prefix to yield the root-relative path", () => {
    expect(relativeHostPath("/host/proj", "/host/proj/src/a.ts")).toBe("src/a.ts");
  });

  // Round-trips with joinHostPath: relativeHostPath(root, joinHostPath(root, rel)) === rel — the guarantee
  // the identity(abs)/IO(relative) split leans on.
  it("round-trips with joinHostPath (lossless)", () => {
    const rel = "src/dir/a.ts";
    expect(relativeHostPath("/host/proj", joinHostPath("/host/proj", rel))).toBe(rel);
  });

  // A trailing separator on the root collapses at the seam, same as joinHostPath.
  it("tolerates a trailing-slash root", () => {
    expect(relativeHostPath("/host/proj/", "/host/proj/src/a.ts")).toBe("src/a.ts");
  });

  // The root itself resolves to "." (the tree root's own path in root-relative space).
  it("maps the root itself to '.'", () => {
    expect(relativeHostPath("/host/proj", "/host/proj")).toBe(".");
  });

  // A path outside the root can't be made relative; it passes through as-is (the daemon resolves an
  // absolute path directly, ignoring the cwd, so IO still works).
  it("passes a path outside the root through unchanged", () => {
    expect(relativeHostPath("/host/proj", "/other/x.ts")).toBe("/other/x.ts");
  });

  // Windows backslashes fold before the prefix comparison so a "\\"-spelled absolute still strips.
  it("folds backslashes before stripping", () => {
    expect(relativeHostPath("/host/proj", "\\host\\proj\\src\\a.ts")).toBe("src/a.ts");
  });

  // With no root there is nothing to strip; the input passes through (the empty-launcher / no-tree case).
  it("passes through when the root is empty", () => {
    expect(relativeHostPath("", "src/a.ts")).toBe("src/a.ts");
    expect(relativeHostPath("", "")).toBe("");
  });
});
