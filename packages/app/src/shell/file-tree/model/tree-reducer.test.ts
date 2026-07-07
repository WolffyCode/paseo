import { describe, expect, it } from "vitest";
import {
  buildVisibleNodes,
  foldDirectoryListing,
  selectPath,
  toggleExpandedPath,
} from "./tree-reducer";
import type { TreeEntry } from "./types";

function entry(
  path: string,
  kind: TreeEntry["kind"],
  name = path.split("/").pop() ?? path,
): TreeEntry {
  return { name, path, kind, size: 0, modifiedAt: "2026-01-01T00:00:00.000Z" };
}

describe("toggleExpandedPath", () => {
  it("adds a path that is not yet expanded", () => {
    const next = toggleExpandedPath(new Set<string>(), "/work/src");
    expect([...next]).toEqual(["/work/src"]);
  });

  it("removes a path that is already expanded (idempotent toggle)", () => {
    const next = toggleExpandedPath(new Set(["/work/src"]), "/work/src");
    expect([...next]).toEqual([]);
  });

  it("does not mutate the input set", () => {
    const input = new Set(["/work/src"]);
    toggleExpandedPath(input, "/work/lib");
    expect([...input]).toEqual(["/work/src"]);
  });
});

describe("selectPath", () => {
  it("selects a freshly clicked path (single-select replaces the previous)", () => {
    expect(selectPath("/work/a.ts", "/work/b.ts")).toBe("/work/b.ts");
  });

  it("selects from no prior selection", () => {
    expect(selectPath(null, "/work/b.ts")).toBe("/work/b.ts");
  });

  it("clicking the already-selected path keeps it selected (mutually exclusive single-select)", () => {
    expect(selectPath("/work/b.ts", "/work/b.ts")).toBe("/work/b.ts");
  });
});

describe("foldDirectoryListing", () => {
  it("folds a directory's entries into the cache under its path", () => {
    const next = foldDirectoryListing(new Map(), "/work", [entry("/work/a.ts", "file")]);
    expect(next.get("/work")).toEqual([entry("/work/a.ts", "file")]);
  });

  it("replaces a prior listing for the same directory (re-list overwrites)", () => {
    const prior = new Map([["/work", [entry("/work/old.ts", "file")]]]);
    const next = foldDirectoryListing(prior, "/work", [entry("/work/new.ts", "file")]);
    expect(next.get("/work")).toEqual([entry("/work/new.ts", "file")]);
  });

  it("does not mutate the input cache", () => {
    const input = new Map([["/work", [entry("/work/a.ts", "file")]]]);
    foldDirectoryListing(input, "/lib", [entry("/lib/b.ts", "file")]);
    expect(input.has("/lib")).toBe(false);
  });
});

describe("buildVisibleNodes", () => {
  const base = {
    rootPath: "/work",
    selectedPath: null as string | null,
    nodeLoading: new Set<string>(),
    nodeError: new Map<string, string>(),
    editing: null,
  };

  it("lists the root's first level with directories before files, each alphabetical", () => {
    const cache = new Map([
      [
        "/work",
        [
          entry("/work/z.ts", "file"),
          entry("/work/src", "directory"),
          entry("/work/a.ts", "file"),
          entry("/work/lib", "directory"),
        ],
      ],
    ]);
    const nodes = buildVisibleNodes({ ...base, expanded: new Set(), cache });
    expect(nodes.map((n) => [n.name, n.kind, n.depth])).toEqual([
      ["lib", "directory", 0],
      ["src", "directory", 0],
      ["a.ts", "file", 0],
      ["z.ts", "file", 0],
    ]);
  });

  it("does not descend into a directory that is collapsed even if its listing is cached", () => {
    const cache = new Map([
      ["/work", [entry("/work/src", "directory")]],
      ["/work/src", [entry("/work/src/index.ts", "file")]],
    ]);
    const nodes = buildVisibleNodes({ ...base, expanded: new Set(), cache });
    expect(nodes.map((n) => n.name)).toEqual(["src"]);
    expect(nodes[0]?.isExpanded).toBe(false);
  });

  it("descends one indent level into an expanded, cached directory", () => {
    const cache = new Map([
      ["/work", [entry("/work/src", "directory")]],
      ["/work/src", [entry("/work/src/index.ts", "file")]],
    ]);
    const nodes = buildVisibleNodes({ ...base, expanded: new Set(["/work/src"]), cache });
    expect(nodes.map((n) => [n.name, n.depth, n.isExpanded])).toEqual([
      ["src", 0, true],
      ["index.ts", 1, false],
    ]);
  });

  it("marks the selected row and a loading/error directory", () => {
    const cache = new Map([
      ["/work", [entry("/work/src", "directory"), entry("/work/a.ts", "file")]],
    ]);
    const nodes = buildVisibleNodes({
      ...base,
      expanded: new Set(),
      cache,
      selectedPath: "/work/a.ts",
      nodeLoading: new Set(["/work/src"]),
      nodeError: new Map([["/work/src", "denied"]]),
    });
    const src = nodes.find((n) => n.name === "src");
    const file = nodes.find((n) => n.name === "a.ts");
    expect(src?.isLoading).toBe(true);
    expect(src?.isError).toBe(true);
    expect(file?.isSelected).toBe(true);
    expect(src?.isSelected).toBe(false);
  });

  it("inserts an inline draft placeholder row inside the parent directory for a new-file edit", () => {
    const cache = new Map([
      ["/work", [entry("/work/src", "directory")]],
      ["/work/src", [entry("/work/src/index.ts", "file")]],
    ]);
    const nodes = buildVisibleNodes({
      ...base,
      expanded: new Set(["/work/src"]),
      cache,
      editing: { kind: "new-file", parentPath: "/work/src", draftName: "", error: null },
    });
    const draft = nodes.find((n) => n.isDraft);
    expect(draft).toBeTruthy();
    expect(draft?.kind).toBe("file");
    expect(draft?.depth).toBe(1);
    // The draft sits among the parent's children, not at the root.
    expect(nodes.map((n) => n.name)).toContain("index.ts");
  });

  it("a new-folder draft renders as a directory placeholder", () => {
    const cache = new Map([["/work", [entry("/work/a.ts", "file")]]]);
    const nodes = buildVisibleNodes({
      ...base,
      expanded: new Set(),
      cache,
      editing: { kind: "new-folder", parentPath: "/work", draftName: "", error: null },
    });
    const draft = nodes.find((n) => n.isDraft);
    expect(draft?.kind).toBe("directory");
    expect(draft?.depth).toBe(0);
  });

  it("does not insert a draft row for a rename edit (rename mutates an existing row in place)", () => {
    const cache = new Map([["/work", [entry("/work/a.ts", "file")]]]);
    const nodes = buildVisibleNodes({
      ...base,
      expanded: new Set(),
      cache,
      editing: {
        kind: "rename",
        targetPath: "/work/a.ts",
        originalName: "a.ts",
        draftName: "b.ts",
        error: null,
      },
    });
    expect(nodes.some((n) => n.isDraft)).toBe(false);
  });

  it("returns an empty list when the root has not been listed yet", () => {
    expect(buildVisibleNodes({ ...base, expanded: new Set(), cache: new Map() })).toEqual([]);
  });
});
