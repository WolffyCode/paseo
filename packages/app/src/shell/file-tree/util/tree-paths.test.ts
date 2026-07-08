import { describe, expect, it } from "vitest";
import {
  buildAbsoluteTreePath,
  isAbsolutePath,
  parentDirectory,
  relativeToTreeRoot,
} from "./tree-paths";

describe("isAbsolutePath", () => {
  it("recognizes posix, UNC, and windows-drive absolute paths", () => {
    expect(isAbsolutePath("/usr/local")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("C:/Users")).toBe(true);
    expect(isAbsolutePath("D:\\Temp")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isAbsolutePath("src/index.ts")).toBe(false);
    expect(isAbsolutePath("./foo")).toBe(false);
    expect(isAbsolutePath("foo")).toBe(false);
  });
});

describe("buildAbsoluteTreePath", () => {
  it("joins a relative entry path onto the tree root with a posix separator", () => {
    expect(buildAbsoluteTreePath({ treeRoot: "/work/project", entryPath: "src/index.ts" })).toBe(
      "/work/project/src/index.ts",
    );
  });

  it("returns the entry path unchanged when it is already absolute", () => {
    expect(buildAbsoluteTreePath({ treeRoot: "/work/project", entryPath: "/etc/hosts" })).toBe(
      "/etc/hosts",
    );
  });

  it("returns the normalized root when the entry path is empty or '.'", () => {
    expect(buildAbsoluteTreePath({ treeRoot: "/work/project/", entryPath: "." })).toBe(
      "/work/project",
    );
    expect(buildAbsoluteTreePath({ treeRoot: "/work/project", entryPath: "" })).toBe(
      "/work/project",
    );
  });

  it("uses a backslash separator when the root is a windows path", () => {
    expect(
      buildAbsoluteTreePath({ treeRoot: "C:\\work\\project", entryPath: "src/index.ts" }),
    ).toBe("C:\\work\\project\\src\\index.ts");
  });

  it("falls back to the entry path when the root is blank", () => {
    expect(buildAbsoluteTreePath({ treeRoot: "  ", entryPath: "src/index.ts" })).toBe(
      "src/index.ts",
    );
  });
});

describe("parentDirectory", () => {
  it("returns the directory containing a posix file", () => {
    expect(parentDirectory("/work/project/src/index.ts")).toBe("/work/project/src");
  });

  it("returns the posix root for a top-level file", () => {
    expect(parentDirectory("/index.ts")).toBe("/");
  });

  it("strips a trailing separator before taking the parent", () => {
    expect(parentDirectory("/work/project/src/")).toBe("/work/project");
  });

  it("returns the directory containing a windows file", () => {
    expect(parentDirectory("C:\\work\\project\\a.ts")).toBe("C:\\work\\project");
  });

  it("returns the value unchanged when it has no separator", () => {
    expect(parentDirectory("a.ts")).toBe("a.ts");
  });
});

describe("relativeToTreeRoot", () => {
  it("strips the tree root prefix to produce a path relative to the root", () => {
    expect(
      relativeToTreeRoot({ treeRoot: "/work/project", absolutePath: "/work/project/src/index.ts" }),
    ).toBe("src/index.ts");
  });

  it("returns the absolute path unchanged when it is outside the tree root", () => {
    expect(relativeToTreeRoot({ treeRoot: "/work/project", absolutePath: "/etc/hosts" })).toBe(
      "/etc/hosts",
    );
  });

  it("returns '.' when the absolute path is the tree root itself", () => {
    expect(relativeToTreeRoot({ treeRoot: "/work/project/", absolutePath: "/work/project" })).toBe(
      ".",
    );
  });
});
