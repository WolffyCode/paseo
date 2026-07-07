// Tests for the file-tree data layer (the new directory's "connect to server" port). The store only
// ever calls this layer, so these tests pin: each method forwards to the right injected client RPC
// with the right args, list/search return the new-directory TreeEntry/SearchMatch shapes, and desktop
// resolution reads the host-normalized path back off the listing (no client-side os.homedir guess).
// A hand-written fake client (not a framework mock) records calls; this is the minimal injected seam.

import { describe, expect, test } from "vitest";
import { createFileTreeData, type FileTreeRpcClient } from "./file-tree-data";

// Records every RPC call and returns scripted payloads, so a test asserts forwarding + shaping
// without a real daemon. Each method is optional-overridable; unset ones return a benign default.
function fakeClient(overrides: Partial<FileTreeRpcClient> = {}): {
  client: FileTreeRpcClient;
  calls: Array<{ method: string; args: unknown[] }>;
} {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    <T>(method: string, result: T) =>
    (...args: unknown[]): Promise<T> => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  const client: FileTreeRpcClient = {
    listDirectory: record("listDirectory", { path: "/host/root", entries: [] }),
    fsSearch: record("fsSearch", { matches: [], truncated: false }),
    fsCreate: record("fsCreate", { path: "/host/root/a.txt" }),
    fsMkdir: record("fsMkdir", { path: "/host/root/dir" }),
    fsRename: record("fsRename", { path: "/host/root/b.txt" }),
    fsMove: record("fsMove", { path: "/host/dest/x" }),
    fsCopy: record("fsCopy", { path: "/host/dest/y" }),
    fsDelete: record("fsDelete", { path: "/host/root/gone.txt" }),
    ...overrides,
  };
  return { client, calls };
}

describe("file-tree-data list", () => {
  test("listDirectory forwards (root, path) and returns the listing's path + TreeEntry[]", async () => {
    const entries = [
      { name: "src", path: "/host/root/src", kind: "directory" as const, size: 0, modifiedAt: "t" },
    ];
    const seen: unknown[][] = [];
    const { client } = fakeClient({
      listDirectory: (...args) => {
        seen.push(args);
        return Promise.resolve({ path: "/host/root", entries });
      },
    });
    const data = createFileTreeData(client);

    const result = await data.listDirectory("/host/root", "src");

    expect(result).toEqual({ path: "/host/root", absolutePath: undefined, entries });
    expect(seen).toEqual([["/host/root", "src"]]);
  });

  test("listDirectory surfaces the host-resolved absolutePath when the daemon sends it", async () => {
    const { client } = fakeClient({
      listDirectory: () =>
        Promise.resolve({ path: ".", absolutePath: "/Users/me/Desktop", entries: [] }),
    });
    const data = createFileTreeData(client);

    const result = await data.listDirectory("~/Desktop", ".");

    expect(result.absolutePath).toBe("/Users/me/Desktop");
  });

  test("listDirectory leaves absolutePath undefined for an old daemon that omits it", async () => {
    const { client } = fakeClient({
      listDirectory: () => Promise.resolve({ path: ".", entries: [] }),
    });
    const data = createFileTreeData(client);

    const result = await data.listDirectory("~/Desktop", ".");

    expect(result.absolutePath).toBeUndefined();
  });
});

describe("file-tree-data search", () => {
  test("search forwards a content-mode FsSearchInput and returns matches + truncated", async () => {
    const matches = [{ path: "/host/root/a.ts", kind: "file" as const, line: 3, preview: "x" }];
    const seen: unknown[][] = [];
    const { client } = fakeClient({
      fsSearch: (...args) => {
        seen.push(args);
        return Promise.resolve({ matches, truncated: true });
      },
    });
    const data = createFileTreeData(client);

    const result = await data.search({
      root: "/host/root",
      query: "x",
      mode: "content",
      basePath: "src",
    });

    expect(result).toEqual({ matches, truncated: true });
    expect(seen[0]?.[0]).toEqual({
      root: "/host/root",
      query: "x",
      mode: "content",
      basePath: "src",
    });
  });

  test("search forwards a name-mode FsSearchInput (name search runs on the host too)", async () => {
    const matches = [{ path: "deep/nested/AGENTS.md", kind: "file" as const }];
    const seen: unknown[][] = [];
    const { client } = fakeClient({
      fsSearch: (...args) => {
        seen.push(args);
        return Promise.resolve({ matches, truncated: false });
      },
    });
    const data = createFileTreeData(client);

    const result = await data.search({ root: "/host/root", query: "agents", mode: "name" });

    expect(result).toEqual({ matches, truncated: false });
    expect(seen[0]?.[0]).toEqual({ root: "/host/root", query: "agents", mode: "name" });
  });
});

describe("file-tree-data writes", () => {
  test("createFile forwards (root, path) to fsCreate and returns the landed path", async () => {
    const seen: unknown[][] = [];
    const { client } = fakeClient({
      fsCreate: (...args) => {
        seen.push(args);
        return Promise.resolve({ path: "/host/root/new.txt" });
      },
    });
    const data = createFileTreeData(client);

    const landed = await data.createFile("/host/root", "new.txt");

    expect(landed).toBe("/host/root/new.txt");
    expect(seen).toEqual([["/host/root", "new.txt"]]);
  });

  test("createDirectory forwards (root, path) to fsMkdir", async () => {
    const { client, calls } = fakeClient();
    const data = createFileTreeData(client);

    await data.createDirectory("/host/root", "dir");

    expect(calls).toEqual([{ method: "fsMkdir", args: ["/host/root", "dir"] }]);
  });

  test("rename forwards (root, path, newName) to fsRename", async () => {
    const { client, calls } = fakeClient();
    const data = createFileTreeData(client);

    await data.rename("/host/root", "/host/root/old.txt", "new.txt");

    expect(calls).toEqual([
      { method: "fsRename", args: ["/host/root", "/host/root/old.txt", "new.txt"] },
    ]);
  });

  test("move forwards (root, from, toDir) to fsMove", async () => {
    const { client, calls } = fakeClient();
    const data = createFileTreeData(client);

    await data.move("/host/root", "/host/root/a", "/host/root/dest");

    expect(calls).toEqual([
      { method: "fsMove", args: ["/host/root", "/host/root/a", "/host/root/dest"] },
    ]);
  });

  test("copy forwards (root, from, toDir) to fsCopy", async () => {
    const { client, calls } = fakeClient();
    const data = createFileTreeData(client);

    await data.copy("/host/root", "/host/root/a", "/host/root/dest");

    expect(calls).toEqual([
      { method: "fsCopy", args: ["/host/root", "/host/root/a", "/host/root/dest"] },
    ]);
  });

  test("del forwards (root, path) to fsDelete and returns the removed path", async () => {
    const seen: unknown[][] = [];
    const { client } = fakeClient({
      fsDelete: (...args) => {
        seen.push(args);
        return Promise.resolve({ path: "src/gone.ts" });
      },
    });
    const data = createFileTreeData(client);

    const removed = await data.del("/host/root", "src/gone.ts");

    expect(removed).toBe("src/gone.ts");
    expect(seen).toEqual([["/host/root", "src/gone.ts"]]);
  });
});
