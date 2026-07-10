// Tests for FileTreeStore — the file tree's single MobX truth source. Logic is delegated to the
// Phase-1 pure functions (resolve-root / tree-reducer / search-state / inline-edit / clipboard-state /
// context-menu-items) and all IO to the injected data layer + bridges, so these tests inject minimal
// fakes (fake data layer, fake composer/right-tab bridges, scripted context) and assert the store's
// transitions WITHOUT rendering. Focus per the dev brief: the inline edit state machine (§3.10), the
// write flows (success relists, failure records error), clipboard paste, the switch-directory three
// forks, search-machine driving, the new-file→right-tab linkage (folder does not), and live menu
// derivation.
//
// Path space: the host filesystem RPCs are ROOT-RELATIVE (entry paths come back relative to the root,
// "." for the root listing), so the fixtures use relative entry paths ("a.ts", "dir", "dir/child.ts")
// and key the fake's listings by the relative path the store passes; hostRoot is the absolute root.

import { describe, expect, test, vi } from "vitest";
import { FileTreeStore, type FileTreeStoreDeps } from "./file-tree-store";
import type { DirectoryListing, FileTreeData } from "../data/file-tree-data";
import type { TreeEntry } from "./types";

// A root-relative directory entry (path == name under the root; "parent/name" deeper) to keep fixtures
// terse and faithful to what the host returns.
function entry(name: string, kind: "file" | "directory", parent = ""): TreeEntry {
  const path = parent ? `${parent}/${name}` : name;
  return { name, path, kind, size: 0, modifiedAt: "t" };
}

// Drop the entry with the given path from a listing (module-level so the stateful delete fake's filter
// isn't a deeply-nested inline callback).
function removeByPath(entries: TreeEntry[], path: string): TreeEntry[] {
  return entries.filter((e) => e.path !== path);
}

// Build a fake data layer whose listDirectory returns scripted entries per RELATIVE directory path
// ("." = root), and whose write methods are vi.fn so a test asserts which RPC fired with what. Each
// write returns a landed (root-relative) path.
function fakeData(
  listings: Record<string, TreeEntry[]> = {},
  overrides: Partial<FileTreeData> = {},
): {
  data: FileTreeData;
  createFile: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  move: ReturnType<typeof vi.fn>;
  copy: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
} {
  const createFile = vi.fn(async (_root: string, path: string) => path);
  const createDirectory = vi.fn(async (_root: string, path: string) => path);
  const rename = vi.fn(async (_root: string, path: string, newName: string) => {
    const index = path.lastIndexOf("/");
    return index < 0 ? newName : `${path.slice(0, index)}/${newName}`;
  });
  const move = vi.fn(async (_root: string, from: string, toDir: string) => {
    return `${toDir}/${from.slice(from.lastIndexOf("/") + 1)}`;
  });
  const copy = vi.fn(async (_root: string, from: string, toDir: string) => {
    return `${toDir}/${from.slice(from.lastIndexOf("/") + 1)}`;
  });
  const search = vi.fn(async () => ({ matches: [], truncated: false }));
  const del = vi.fn(async (_root: string, path: string) => path);
  const data: FileTreeData = {
    listDirectory: async (_root: string, path: string): Promise<DirectoryListing> => {
      return { path, entries: listings[path] ?? [] };
    },
    search,
    createFile,
    createDirectory,
    rename,
    move,
    copy,
    del,
    ...overrides,
  };
  return { data, createFile, createDirectory, rename, move, copy, del, search };
}

// Assemble a store over fakes with a scripted shell context (features/ids/draft/offline overridable).
// Each injected port is a vi.fn typed to its dep signature so the fakes satisfy FileTreeStoreDeps.
function makeStore(input: {
  data?: FileTreeData;
  context?: Partial<ReturnType<FileTreeStoreDeps["getContext"]>>;
  composerAdd?: FileTreeStoreDeps["composer"]["addPathToChat"];
  rightTabOpen?: FileTreeStoreDeps["rightTab"]["openFileInRightTab"];
  reveal?: FileTreeStoreDeps["revealInFinder"];
  copyText?: FileTreeStoreDeps["copyToClipboard"];
  pick?: FileTreeStoreDeps["pickDirectory"];
  confirm?: FileTreeStoreDeps["confirmDestructive"];
}) {
  const composerAdd = vi.fn(input.composerAdd ?? (() => {}));
  const rightTabOpen = vi.fn(input.rightTabOpen ?? (() => {}));
  const reveal = vi.fn(input.reveal ?? (() => {}));
  const copyText = vi.fn(input.copyText ?? (() => {}));
  const pick = vi.fn(input.pick ?? (async () => null));
  // Confirm port defaults to "yes" so existing tests that don't care about the gate proceed.
  const confirm = vi.fn(input.confirm ?? (async () => true));
  const deps: FileTreeStoreDeps = {
    data: input.data ?? fakeData().data,
    composer: { addPathToChat: composerAdd },
    rightTab: { openFileInRightTab: rightTabOpen },
    revealInFinder: reveal,
    copyToClipboard: copyText,
    pickDirectory: pick,
    confirmDestructive: confirm,
    getContext: () => ({
      serverId: "srv1",
      workspaceId: "ws1",
      conversationRoot: null,
      draftKey: "draft1",
      features: { fsSearch: true, fsWrite: true },
      isElectron: true,
      hasActiveDraft: true,
      isOffline: false,
      ...input.context,
    }),
  };
  return {
    store: new FileTreeStore(deps),
    composerAdd,
    rightTabOpen,
    reveal,
    copyText,
    pick,
    confirm,
  };
}

describe("FileTreeStore root + listing", () => {
  test("ensureRoot resolves the external root, lists it, and exposes visible nodes", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file"), entry("dir", "directory")] });
    const { store } = makeStore({ data });

    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    expect(store.rootPath).toBe("/root");
    expect(store.visibleNodes.map((n) => n.name)).toEqual(["dir", "a.ts"]);
  });

  test("ensureRoot with no external/conversation root roots at the host desktop ('~/Desktop')", async () => {
    const seen: string[] = [];
    const { data } = fakeData({ ".": [entry("x", "file")] });
    const wrapped: FileTreeData = {
      ...data,
      listDirectory: async (root, path) => {
        seen.push(root);
        return data.listDirectory(root, path);
      },
    };
    const { store } = makeStore({ data: wrapped });

    await store.ensureRoot({ externalRoot: null, conversationRoot: null });

    expect(store.rootPath).toBe("~/Desktop"); // host expands "~" per call; client never guesses homedir
    expect(seen[0]).toBe("~/Desktop");
  });

  test("syncConversationRoot re-roots from desktop to the live conversation root", async () => {
    const { data } = fakeData({ ".": [entry("x", "file")] });
    const { store } = makeStore({ data });

    await store.ensureRoot({ externalRoot: null, conversationRoot: null });
    expect(store.rootPath).toBe("~/Desktop");

    await store.syncConversationRoot("/work/project");

    expect(store.rootPath).toBe("/work/project");
  });

  test("syncConversationRoot does not override an explicit external root", async () => {
    const { data } = fakeData({ ".": [entry("x", "file")] });
    const { store } = makeStore({ data });

    await store.ensureRoot({ externalRoot: "/picked", conversationRoot: null });
    await store.syncConversationRoot("/work/project");

    expect(store.rootPath).toBe("/picked");
  });

  test("toggleExpand lists an uncached directory and folds its children in", async () => {
    const { data } = fakeData({
      ".": [entry("dir", "directory")],
      dir: [entry("child.ts", "file", "dir")],
    });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.toggleExpand("dir");

    expect(store.visibleNodes.map((n) => n.name)).toEqual(["dir", "child.ts"]);
  });
});

describe("FileTreeStore switch directory (three forks)", () => {
  test("pickAndShowDirectory with a chosen path resets the tree to that root", async () => {
    // Both roots resolve their own first level under "."; the fake keys by relative path, so the second
    // listing returns the same "." key — assert via the new hostRoot + cleared selection instead.
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data, pick: async () => "/other" });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.select("a.ts");

    await store.pickAndShowDirectory();

    expect(store.rootPath).toBe("/other");
    expect(store.selectedPath).toBeNull(); // showDirectory clears selection
  });

  test("pickAndShowDirectory cancelled (null) leaves the current root untouched", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data, pick: async () => null });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.pickAndShowDirectory();

    expect(store.rootPath).toBe("/root");
  });

  test("showDirectory whose listing fails lands the panel in the error state", async () => {
    const { data } = fakeData(
      {},
      {
        listDirectory: async () => {
          throw new Error("boom");
        },
      },
    );
    const { store } = makeStore({ data });

    await store.showDirectory("/bad");

    expect(store.panelState).toBe("error");
  });

  // A blank external root is not a directory. Reject it before the root-change reset so an invalid caller
  // cannot erase the current listing, expansion, or selection and leave the tree rooted at "".
  test("showDirectory ignores a blank root without clearing the current tree", async () => {
    const { data } = fakeData({ ".": [entry("kept.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.select("kept.ts");

    await store.showDirectory("   ");

    expect(store.rootPath).toBe("/root");
    expect(store.selectedPath).toBe("kept.ts");
    expect(store.visibleNodes.map((node) => node.path)).toEqual(["kept.ts"]);
  });

  // Retry is the error state's required exit. If a prior invalid reveal left hostRoot empty, retry must
  // recover through the normal default-root choice instead of guarding on the falsy corrupted value and
  // becoming a permanently dead button.
  test("retry falls back to the default root when the failed host root is empty", async () => {
    const listedRoots: string[] = [];
    const data: FileTreeData = {
      ...fakeData().data,
      listDirectory: async (root, path) => {
        listedRoots.push(root);
        if (root === "/bad") {
          throw new Error("cannot list root");
        }
        return { path, absolutePath: "/Users/me/Desktop", entries: [] };
      },
    };
    const { store } = makeStore({ data });
    await store.showDirectory("/bad");
    expect(store.panelState).toBe("error");
    store.hostRoot = "";

    await store.retry();

    expect(listedRoots).toEqual(["/bad", "~/Desktop"]);
    expect(store.rootPath).toBe("/Users/me/Desktop");
    expect(store.panelState).toBe("empty");
  });
});

describe("FileTreeStore inline edit state machine (§3.10)", () => {
  test("beginNew places an editing placeholder (empty draft, parent set), no RPC fired", async () => {
    const { data, createFile } = fakeData({ ".": [] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.beginNew("new-file", ".");

    expect(store.editing).toEqual({
      kind: "new-file",
      parentPath: ".",
      draftName: "",
      error: null,
    });
    expect(createFile).not.toHaveBeenCalled();
    // The draft placeholder row is present in the visible nodes for the view to focus.
    expect(store.visibleNodes.some((n) => n.isDraft)).toBe(true);
  });

  test("new-file: a legal name commits via fsCreate, clears editing, and triggers the right tab", async () => {
    const { data, createFile } = fakeData({ ".": [] });
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginNew("new-file", ".");
    store.setDraftName("hello.ts");

    await store.commitEdit();

    expect(createFile).toHaveBeenCalledWith("/root", "hello.ts");
    expect(store.editing).toBeNull();
    expect(rightTabOpen).toHaveBeenCalledTimes(1);
    // The bridge carries the ABSOLUTE host path (identity axis) — joined under the tree root — so the
    // right panel dedups a file to one tab regardless of which root opened it (defect 7).
    expect(rightTabOpen.mock.calls[0][0]).toMatchObject({
      location: { path: "/root/hello.ts" },
      workspaceId: "ws1",
      serverId: "srv1",
    });
  });

  test("new-folder: a legal name commits via fsMkdir and does NOT trigger the right tab", async () => {
    const { data, createDirectory } = fakeData({ ".": [] });
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginNew("new-folder", ".");
    store.setDraftName("src");

    await store.commitEdit();

    expect(createDirectory).toHaveBeenCalledWith("/root", "src");
    expect(rightTabOpen).not.toHaveBeenCalled();
  });

  test("new-file: an empty-name blur discards the placeholder with no RPC (董事长 scenario)", async () => {
    const { data, createFile } = fakeData({ ".": [] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginNew("new-file", ".");
    // draftName stays "" → blur maps to cancel.

    store.cancelEdit();

    expect(store.editing).toBeNull();
    expect(createFile).not.toHaveBeenCalled();
    expect(store.visibleNodes.some((n) => n.isDraft)).toBe(false);
  });

  test("new-file: an illegal/duplicate name on commit discards without creating (no RPC)", async () => {
    const { data, createFile } = fakeData({ ".": [entry("dup.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginNew("new-file", ".");
    store.setDraftName("dup.ts"); // duplicate → error

    await store.commitEdit();

    expect(createFile).not.toHaveBeenCalled();
    expect(store.editing).toBeNull(); // new-* discards on illegal commit
  });

  test("rename: a legal new name commits via fsRename", async () => {
    const { data, rename } = fakeData({ ".": [entry("old.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginRename("old.ts");
    store.setDraftName("new.ts");

    await store.commitEdit();

    expect(rename).toHaveBeenCalledWith("/root", "old.ts", "new.ts");
    expect(store.editing).toBeNull();
  });

  test("rename: an illegal name keeps the editor open with the error (not discarded)", async () => {
    const { data, rename } = fakeData({ ".": [entry("old.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginRename("old.ts");
    store.setDraftName("bad/name"); // invalid-chars

    await store.commitEdit();

    expect(rename).not.toHaveBeenCalled();
    expect(store.editing).not.toBeNull(); // rename stays open to let the user fix it
    expect(store.editing && "error" in store.editing && store.editing.error).toBe("invalid-chars");
  });

  test("rename: cancel restores the original name and fires no RPC", async () => {
    const { data, rename } = fakeData({ ".": [entry("old.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginRename("old.ts");
    store.setDraftName("whatever.ts");

    store.cancelEdit();

    expect(rename).not.toHaveBeenCalled();
    expect(store.editing).toBeNull();
    expect(store.visibleNodes.find((n) => n.path === "old.ts")?.name).toBe("old.ts");
  });

  test("rename: committing the unchanged original name reverts (no duplicate error, no RPC)", async () => {
    // §3.10: the rename target is excluded from its own duplicate check, so re-entering its own
    // name is not a false `duplicate`; committing the unchanged name is a no-op restore.
    const { data, rename } = fakeData({ ".": [entry("old.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginRename("old.ts");
    store.setDraftName("old.ts");

    expect(store.editing && "error" in store.editing && store.editing.error).toBeNull();
    await store.commitEdit();

    expect(rename).not.toHaveBeenCalled();
    expect(store.editing).toBeNull(); // restored, not stuck on a false duplicate
  });

  test("rename: a name colliding with a different sibling still errors as duplicate", async () => {
    const { data, rename } = fakeData({
      ".": [entry("old.ts", "file"), entry("taken.ts", "file")],
    });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginRename("old.ts");
    store.setDraftName("taken.ts");

    await store.commitEdit();

    expect(rename).not.toHaveBeenCalled();
    expect(store.editing && "error" in store.editing && store.editing.error).toBe("duplicate");
  });

  test("new-file: a commit whose RPC fails records a node error and clears editing", async () => {
    const { data } = fakeData(
      { ".": [] },
      {
        createFile: async () => {
          throw new Error("denied");
        },
      },
    );
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.beginNew("new-file", ".");
    store.setDraftName("hello.ts");

    await store.commitEdit();

    expect(store.nodeError.get(".")).toBeTruthy();
    expect(rightTabOpen).not.toHaveBeenCalled(); // no linkage when create failed
  });
});

describe("FileTreeStore clipboard paste", () => {
  test("cut then paste moves the entry and clears the clipboard", async () => {
    const { data, move } = fakeData({
      ".": [entry("a.ts", "file"), entry("dest", "directory")],
      dest: [],
    });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.cut("a.ts");

    await store.paste("dest");

    expect(move).toHaveBeenCalledWith("/root", "a.ts", "dest");
    expect(store.pasteEnabled).toBe(false); // cut consumed
  });

  test("copy then paste copies the entry and keeps the clipboard", async () => {
    const { data, copy } = fakeData({
      ".": [entry("a.ts", "file"), entry("dest", "directory")],
      dest: [],
    });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.copy("a.ts");

    await store.paste("dest");

    expect(copy).toHaveBeenCalledWith("/root", "a.ts", "dest");
    expect(store.pasteEnabled).toBe(true); // copy persists for repeat pastes
  });
});

describe("FileTreeStore delete", () => {
  test("deleteEntry removes a file via fsDelete and relists the parent (entry gone)", async () => {
    // The parent listing changes after delete: first "." has a.ts + keep.ts; the relist returns only
    // keep.ts. A stateful fake swaps the "." listing once delete fires so the relist reflects removal.
    let rootEntries = [entry("a.ts", "file"), entry("keep.ts", "file")];
    const del = vi.fn(async (_root: string, path: string) => {
      rootEntries = removeByPath(rootEntries, path);
      return path;
    });
    const data: FileTreeData = {
      ...fakeData().data,
      listDirectory: async (_root, path) => ({ path, entries: path === "." ? rootEntries : [] }),
      del,
    };
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    expect(store.visibleNodes.map((n) => n.name)).toContain("a.ts");

    await store.deleteEntry("a.ts");

    expect(del).toHaveBeenCalledWith("/root", "a.ts");
    expect(store.visibleNodes.map((n) => n.name)).toEqual(["keep.ts"]);
  });

  test("deleteEntry on a nested entry relists its containing directory", async () => {
    const del = vi.fn(async (_root: string, path: string) => path);
    const data: FileTreeData = {
      ...fakeData().data,
      listDirectory: async (_root, path) => ({ path, entries: [] }),
      del,
    };
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.deleteEntry("src/old.ts");

    expect(del).toHaveBeenCalledWith("/root", "src/old.ts");
    // No node error recorded on the parent dir for a successful delete.
    expect(store.nodeError.get("src")).toBeUndefined();
  });

  test("a successful relist clears the prior node error for that directory", async () => {
    let errored = true;
    const data: FileTreeData = {
      ...fakeData({ ".": [entry("a.ts", "file")] }).data,
      listDirectory: async (_root, path) => {
        if (path === ".") {
          return {
            path,
            entries: errored ? [entry("a.ts", "file")] : [entry("keep.ts", "file")],
          };
        }
        return { path, entries: [] };
      },
      del: async (_root, path) => {
        errored = false;
        return path;
      },
    };
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.nodeError = new Map([[".", "stale error"]]);

    await store.deleteEntry("a.ts");

    expect(store.nodeError.get(".")).toBeUndefined();
    expect(store.visibleNodes.map((n) => n.name)).toEqual(["keep.ts"]);
  });

  test("deleteEntry whose RPC fails records a node error on the parent and keeps the tree", async () => {
    const data: FileTreeData = {
      ...fakeData({ ".": [entry("a.ts", "file")] }).data,
      del: async () => {
        throw new Error("permission denied");
      },
    };
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.deleteEntry("a.ts");

    expect(store.nodeError.get(".")).toBeTruthy();
    expect(store.visibleNodes.map((n) => n.name)).toContain("a.ts"); // not removed on failure
  });

  test("requestDelete confirms first, then deletes when the user accepts (entry name in the prompt)", async () => {
    const del = vi.fn(async (_root: string, path: string) => path);
    const data: FileTreeData = {
      ...fakeData().data,
      listDirectory: async (_root, path) => ({ path, entries: [] }),
      del,
    };
    const { store, confirm } = makeStore({ data, confirm: async () => true });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.requestDelete("src/old.ts");

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({ name: "old.ts" });
    expect(del).toHaveBeenCalledWith("/root", "src/old.ts");
  });

  test("requestDelete does NOT delete when the user cancels the confirmation", async () => {
    const del = vi.fn(async (_root: string, path: string) => path);
    const data: FileTreeData = { ...fakeData().data, del };
    const { store } = makeStore({ data, confirm: async () => false });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    await store.requestDelete("a.ts");

    expect(del).not.toHaveBeenCalled();
  });
});

describe("FileTreeStore toolbar actions", () => {
  test("collapseAll folds every expanded directory but keeps selection and cache", async () => {
    const { data } = fakeData({
      ".": [entry("dir", "directory"), entry("a.ts", "file")],
      dir: [entry("child.ts", "file", "dir")],
    });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    await store.toggleExpand("dir");
    store.select("a.ts");
    expect(store.visibleNodes.map((n) => n.path)).toContain("dir/child.ts");

    store.collapseAll();

    expect(store.visibleNodes.map((n) => n.path)).not.toContain("dir/child.ts");
    expect(store.selectedPath).toBe("a.ts"); // selection survives — collapse is not a re-root
    expect(store.dirCache.has("dir")).toBe(true); // cache survives; re-expanding is instant
  });

  test("refreshTree relists the root AND every expanded directory (retry only did the root)", async () => {
    const listed: string[] = [];
    const { data } = fakeData({
      ".": [entry("dir", "directory")],
      dir: [entry("child.ts", "file", "dir")],
    });
    const wrapped: FileTreeData = {
      ...data,
      listDirectory: async (root, path) => {
        listed.push(path);
        return data.listDirectory(root, path);
      },
    };
    const { store } = makeStore({ data: wrapped });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    await store.toggleExpand("dir");
    listed.length = 0;

    await store.refreshTree();

    expect(listed).toEqual([".", "dir"]);
  });
});

describe("FileTreeStore search machine", () => {
  test("activating a content file match reveals it and opens the right tab at the matched line", async () => {
    const { store, rightTabOpen } = makeStore({
      data: fakeData({ ".": [entry("src", "directory")] }).data,
    });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.activateSearchResult({
      path: "src/nested/button.tsx",
      kind: "file",
      line: 42,
      preview: "const button = true;",
    });

    expect(store.expanded).toEqual(new Set(["src", "src/nested"]));
    expect(store.selectedPath).toBe("src/nested/button.tsx");
    expect(rightTabOpen).toHaveBeenCalledWith({
      location: { path: "/root/src/nested/button.tsx", lineStart: 42, lineEnd: 42 },
      workspaceId: "ws1",
      serverId: "srv1",
    });
  });

  test("activating a directory match only reveals it in the tree", async () => {
    const { store, rightTabOpen } = makeStore({
      data: fakeData({ ".": [entry("src", "directory")] }).data,
    });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.activateSearchResult({ path: "src/nested", kind: "directory" });

    expect(store.expanded).toEqual(new Set(["src"]));
    expect(store.selectedPath).toBe("src/nested");
    expect(rightTabOpen).not.toHaveBeenCalled();
  });

  test("name-mode query searches the HOST (fs.search name mode), covering unexpanded layers", async () => {
    vi.useFakeTimers();
    try {
      // The fake host returns a hit in a directory the tree never listed/expanded — the exact case
      // the old client-side filter missed (search must cover the WHOLE root).
      const search = vi.fn(async () => ({
        matches: [{ path: "deep/nested/alpha.ts", kind: "file" as const }],
        truncated: false,
      }));
      const data: FileTreeData = { ...fakeData({ ".": [entry("beta.ts", "file")] }).data, search };
      const { store } = makeStore({ data });
      await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
      store.setSearchMode("name");

      store.setQuery("alpha");
      expect(store.search.phase).toBe("searching"); // debounced RPC pending
      await vi.advanceTimersByTimeAsync(250);

      expect(search).toHaveBeenCalledWith(
        { root: "/root", query: "alpha", mode: "name" },
        expect.any(Function), // the progressive onProgress stream
      );
      expect(store.searchResultsView.map((m) => m.path)).toEqual(["deep/nested/alpha.ts"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("progressive batches stream into results before the final response replaces them", async () => {
    vi.useFakeTimers();
    try {
      type SearchFn = FileTreeData["search"];
      type SearchMatches = Awaited<ReturnType<SearchFn>>["matches"];
      let emitProgress: ((matches: SearchMatches) => void) | undefined;
      let resolveSearch: ((r: Awaited<ReturnType<SearchFn>>) => void) | undefined;
      const search = vi.fn<SearchFn>((_input, onProgress) => {
        emitProgress = onProgress;
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      });
      const data: FileTreeData = { ...fakeData({ ".": [entry("a.ts", "file")] }).data, search };
      const { store } = makeStore({ data });
      await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
      store.setSearchMode("name");
      store.setQuery("a");
      await vi.advanceTimersByTimeAsync(250);

      // First streamed batch: preview paints while the scan continues (in-flight stays true).
      emitProgress?.([{ path: "deep/a1.ts", kind: "file" }]);
      expect(store.search.phase).toBe("results");
      expect(store.searchResultsView.map((m) => m.path)).toEqual(["deep/a1.ts"]);
      expect(store.searchInFlight).toBe(true);

      // Final response replaces the preview with the complete set and settles in-flight.
      resolveSearch?.({
        matches: [
          { path: "deep/a1.ts", kind: "file" },
          { path: "deep/a2.ts", kind: "file" },
        ],
        truncated: false,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(store.searchResultsView.map((m) => m.path)).toEqual(["deep/a1.ts", "deep/a2.ts"]);
      expect(store.searchInFlight).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a successful rename re-runs the active search so results reflect the new names", async () => {
    vi.useFakeTimers();
    try {
      const search = vi
        .fn()
        .mockResolvedValueOnce({
          matches: [{ path: "old-name.ts", kind: "file" }],
          truncated: false,
        })
        .mockResolvedValueOnce({
          matches: [{ path: "new-name.ts", kind: "file" }],
          truncated: false,
        });
      const data: FileTreeData = {
        ...fakeData({ ".": [entry("old-name.ts", "file")] }).data,
        search,
      };
      const { store } = makeStore({ data });
      await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
      store.toggleSearchPanel();
      store.setSearchMode("name");
      store.setQuery("name");
      await vi.advanceTimersByTimeAsync(250);
      expect(store.searchResultsView.map((m) => m.path)).toEqual(["old-name.ts"]);

      // Rename via the inline flow: the write succeeds → the active search re-runs (debounced) and
      // the result list now shows the renamed file. No index anywhere — the re-run IS freshness.
      store.beginRename("old-name.ts");
      store.setDraftName("new-name.ts");
      await store.commitEdit();
      await vi.advanceTimersByTimeAsync(250);

      expect(search).toHaveBeenCalledTimes(2);
      expect(store.searchResultsView.map((m) => m.path)).toEqual(["new-name.ts"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("switching to content mode when fsSearch is missing drives the search into the error phase", async () => {
    const { store } = makeStore({ context: { features: { fsSearch: false } } });
    await store.showDirectory("/root");
    store.setQuery("needle");

    store.setSearchMode("content");

    expect(store.search.phase).toBe("error");
  });

  test("a name-mode query when fsSearch is missing also lands in the error phase (no client fallback)", async () => {
    const { data, search } = fakeData({ ".": [entry("alpha.ts", "file")] });
    const { store } = makeStore({ data, context: { features: { fsSearch: false } } });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.setSearchMode("name");

    store.setQuery("alpha");

    expect(store.search.phase).toBe("error");
    expect(search).not.toHaveBeenCalled();
  });

  test("an empty query returns the search machine to idle", async () => {
    const { data } = fakeData({ ".": [entry("alpha.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.setSearchMode("name");
    store.setQuery("alpha");

    store.setQuery("");

    expect(store.search.phase).toBe("idle");
  });

  test("toolbar search toggle opens and closing clears query/results/scope", async () => {
    const { data, search } = fakeData({ ".": [entry("alpha.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.toggleSearchPanel();
    store.findInFiles("src/file.ts");
    store.setQuery("needle");
    store.toggleSearchPanel();

    expect(store.searchOpen).toBe(false);
    expect(store.search).toMatchObject({ query: "", phase: "idle" });
    expect(store.contentSearchBasePath).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  test("findInFiles opens the content search UI scoped to the containing directory", async () => {
    vi.useFakeTimers();
    try {
      const { data, search } = fakeData({ ".": [entry("src", "directory")] });
      const { store } = makeStore({ data });
      await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

      store.findInFiles("src/button.tsx");
      store.setQuery("onClick");

      expect(store.searchOpen).toBe(true);
      expect(store.search.mode).toBe("content");
      expect(store.contentSearchBasePath).toBe("src");

      await vi.advanceTimersByTimeAsync(250);

      expect(search).toHaveBeenCalledWith(
        { root: "/root", query: "onClick", mode: "content", basePath: "src" },
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("findInFiles on blank/root searches the current root without basePath", async () => {
    vi.useFakeTimers();
    try {
      const { data, search } = fakeData({ ".": [entry("a.ts", "file")] });
      const { store } = makeStore({ data });
      await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

      store.findInFiles(".");
      store.setQuery("needle");
      await vi.advanceTimersByTimeAsync(250);

      expect(store.searchOpen).toBe(true);
      expect(store.contentSearchBasePath).toBeNull();
      expect(search).toHaveBeenCalledWith(
        { root: "/root", query: "needle", mode: "content" },
        expect.any(Function),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("findInFiles with missing fsSearch opens the error state and does not search", async () => {
    const { data, search } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data, context: { features: { fsSearch: false } } });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.findInFiles("a.ts");
    store.setQuery("needle");

    expect(store.searchOpen).toBe(true);
    expect(store.search.mode).toBe("content");
    expect(store.search.phase).toBe("error");
    expect(search).not.toHaveBeenCalled();
  });
});

describe("FileTreeStore context menu derivation (live selector)", () => {
  test("deriveMenu reflects clipboard/platform/draft/write flags from the current context", async () => {
    const { store } = makeStore({});
    await store.showDirectory("/root");
    store.copy("a.ts");

    const items = store.deriveMenu({ kind: "file", path: "a.ts" });
    const byId = Object.fromEntries(items.map((i) => [i.id, i.enabled]));

    expect(byId.cut).toBe(true); // fsWrite available
    expect(byId["add-to-chat"]).toBe(true); // has active draft
    expect(byId["reveal-in-finder"]).toBe(true); // electron
  });

  test("deriveMenu greys write items + reveal + add-to-chat when their gates are off", async () => {
    const { store } = makeStore({
      context: {
        features: { fsWrite: false },
        isElectron: false,
        hasActiveDraft: false,
      },
    });
    await store.showDirectory("/root");

    const items = store.deriveMenu({ kind: "file", path: "a.ts" });
    const byId = Object.fromEntries(items.map((i) => [i.id, i.enabled]));

    expect(byId.cut).toBe(false);
    expect(byId.rename).toBe(false);
    expect(byId["reveal-in-finder"]).toBe(false);
    expect(byId["add-to-chat"]).toBe(false);
  });
});

describe("FileTreeStore cross-module actions", () => {
  test("addToChat forwards the absolute host path + kind + draftKey to the composer bridge", async () => {
    const { store, composerAdd } = makeStore({});
    await store.showDirectory("/root");

    store.addToChat("sub/a.ts", "file");

    expect(composerAdd).toHaveBeenCalledWith({
      path: "/root/sub/a.ts",
      kind: "file",
      draftKey: "draft1",
    });
  });

  test("addToChat is a no-op when there is no draft key", async () => {
    const { store, composerAdd } = makeStore({ context: { draftKey: null } });
    await store.showDirectory("/root");

    store.addToChat("a.ts", "file");

    expect(composerAdd).not.toHaveBeenCalled();
  });

  test("copyPath absolute joins the relative path under the host root", async () => {
    const { store, copyText } = makeStore({});
    await store.showDirectory("/root");

    store.copyPath("sub/a.ts", false);

    expect(copyText).toHaveBeenCalledWith("/root/sub/a.ts");
  });

  test("copyPath relative copies the root-relative path as-is", async () => {
    const { store, copyText } = makeStore({});
    await store.showDirectory("/root");

    store.copyPath("sub/a.ts", true);

    expect(copyText).toHaveBeenCalledWith("sub/a.ts");
  });

  test("revealInFinder forwards the absolute host path to the reveal port", async () => {
    const { store, reveal } = makeStore({});
    await store.showDirectory("/root");

    store.revealInFinder("a.ts");

    expect(reveal).toHaveBeenCalledWith("/root/a.ts");
  });
});

describe("FileTreeStore file activation → right tab (联动2 · defect A)", () => {
  // An explicit file-row click both selects the file and opens/focuses its right-panel tab. This is the
  // hook the whole tree→file-tab chain hangs on: clicking an existing file in the tree must surface it in
  // the right panel (previously only NEW files did, so opening existing files was a dead chain).
  test("activateFile selects the file AND opens it in the right tab", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.activateFile("a.ts");

    expect(store.selectedPath).toBe("a.ts");
    expect(rightTabOpen).toHaveBeenCalledTimes(1);
    expect(rightTabOpen.mock.calls[0][0]).toMatchObject({
      location: { path: "/root/a.ts" },
      workspaceId: "ws1",
      serverId: "srv1",
    });
  });

  // Same file, two tree roots: rooted at "/proj" the file is "src/a.ts"; rooted at "/proj/src" the SAME
  // file is "a.ts". Both must hand the right panel the same ABSOLUTE identity path so its tab dedups them
  // into one tab (defect 7 — id was the root-relative path, which differed per root and never deduped).
  test("activateFile emits the same absolute identity path across tree roots (defect 7)", async () => {
    const deep = makeStore({ data: fakeData({ ".": [entry("src", "directory")] }).data });
    await deep.store.ensureRoot({ externalRoot: "/proj", conversationRoot: null });
    deep.store.activateFile("src/a.ts");

    const nested = makeStore({ data: fakeData({ ".": [entry("a.ts", "file")] }).data });
    await nested.store.ensureRoot({ externalRoot: "/proj/src", conversationRoot: null });
    nested.store.activateFile("a.ts");

    expect(deep.rightTabOpen.mock.calls[0][0].location.path).toBe("/proj/src/a.ts");
    expect(nested.rightTabOpen.mock.calls[0][0].location.path).toBe("/proj/src/a.ts");
  });

  // Plain select (used by the reverse reveal: file tab → tree locate, §3.2) must NOT open a right tab, or
  // switching/arrow-revealing a file would spuriously re-open tabs and loop the two-way linkage. Only the
  // explicit click (activateFile) opens.
  test("select alone does not open a right tab (reverse-reveal must not re-open)", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });

    store.select("a.ts");

    expect(store.selectedPath).toBe("a.ts");
    expect(rightTabOpen).not.toHaveBeenCalled();
  });
});

describe("FileTreeStore absolute root (bug: '~/Desktop' reveal/copy)", () => {
  // When the host root carries a literal "~" (e.g. the desktop root "~/Desktop"), joining it into a
  // reveal/copy-absolute path yields an unresolvable "~/Desktop/a.ts". The root listing now echoes the
  // host-resolved absolutePath; the store captures it as absoluteRoot and builds "~"-free paths from it.
  function desktopData(absolutePath: string | undefined): FileTreeData {
    return {
      ...fakeData().data,
      listDirectory: async (_root, path) => ({
        path,
        absolutePath: path === "." ? absolutePath : undefined,
        entries: [entry("a.ts", "file")],
      }),
    };
  }

  test("captures absoluteRoot from the root listing and reveals the '~'-free absolute path", async () => {
    const { store, reveal } = makeStore({ data: desktopData("/Users/me/Desktop") });
    await store.ensureRoot({ externalRoot: null, conversationRoot: null }); // roots at "~/Desktop"
    expect(store.rootPath).toBe("/Users/me/Desktop");

    store.revealInFinder("a.ts");

    expect(reveal).toHaveBeenCalledWith("/Users/me/Desktop/a.ts"); // not "~/Desktop/a.ts"
  });

  test("copyPath absolute uses the resolved absoluteRoot, not the literal-'~' host root", async () => {
    const { store, copyText } = makeStore({ data: desktopData("/Users/me/Desktop") });
    await store.ensureRoot({ externalRoot: null, conversationRoot: null });

    store.copyPath("sub/a.ts", false);

    expect(copyText).toHaveBeenCalledWith("/Users/me/Desktop/sub/a.ts");
  });

  test("copyPath relative still copies the root-relative path as-is (unaffected by absoluteRoot)", async () => {
    const { store, copyText } = makeStore({ data: desktopData("/Users/me/Desktop") });
    await store.ensureRoot({ externalRoot: null, conversationRoot: null });

    store.copyPath("sub/a.ts", true);

    expect(copyText).toHaveBeenCalledWith("sub/a.ts");
  });

  test("falls back to the host root for absolute paths when the daemon omits absolutePath", async () => {
    // Old daemon: no absolutePath in the listing. An already-absolute external root ("/root") still
    // works as the absolute base, so reveal joins under it unchanged.
    const { store, reveal } = makeStore({ data: desktopData(undefined) });
    await store.showDirectory("/root");

    store.revealInFinder("a.ts");

    expect(reveal).toHaveBeenCalledWith("/root/a.ts");
  });

  // Tree→tab path construction and tab→tree comparison must share the host-resolved root. With a literal
  // "~/Desktop" transport root, both direct-child select and deeper-descendant reveal must remain reachable
  // without silently re-rooting one level down.
  test("uses the resolved root for opened tab paths and reaches select/reveal without re-rooting", async () => {
    const listedRoots: string[] = [];
    const data: FileTreeData = {
      ...fakeData().data,
      listDirectory: async (root, path) => {
        listedRoots.push(root);
        return {
          path,
          absolutePath: root === "~/Desktop" ? "/Users/me/Desktop" : root,
          entries: [],
        };
      },
    };
    const { store, rightTabOpen } = makeStore({ data });
    await store.ensureRoot({ externalRoot: null, conversationRoot: null });

    store.openInRightTab("sample.ts");
    const directPath = rightTabOpen.mock.calls[0][0].location.path;
    await store.revealFile(directPath);
    expect(store.selectedPath).toBe("sample.ts");
    expect(store.expanded.size).toBe(0);

    store.openInRightTab("rp-reverify/src/target.ts");
    const deeperPath = rightTabOpen.mock.calls[1][0].location.path;
    await store.revealFile(deeperPath);

    expect(store.rootPath).toBe("/Users/me/Desktop");
    expect(directPath).toBe("/Users/me/Desktop/sample.ts");
    expect(deeperPath).toBe("/Users/me/Desktop/rp-reverify/src/target.ts");
    expect(store.expanded).toEqual(new Set(["rp-reverify", "rp-reverify/src"]));
    expect(store.selectedPath).toBe("rp-reverify/src/target.ts");
    expect(listedRoots).toEqual(["~/Desktop"]);
  });
});

describe("FileTreeStore revealFile (页签→树 three-branch linkage, item 23)", () => {
  // The file tab commands the tree with an ABSOLUTE path; the store maps it to root-relative space and
  // dispatches reveal/select/reroot by the file's relation to the current root. Each branch bumps
  // revealTick so the view scrolls the located row into view — asserted without rendering.
  test("deeper descendant → reveal: keeps the root, expands ancestors, selects, bumps revealTick", async () => {
    const { data } = fakeData({ ".": [entry("src", "directory")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    const before = store.revealTick;

    await store.revealFile("/root/src/app/index.ts");

    expect(store.rootPath).toBe("/root"); // root unchanged
    expect(store.expanded.has("src")).toBe(true); // ancestor expanded
    expect(store.expanded.has("src/app")).toBe(true);
    expect(store.selectedPath).toBe("src/app/index.ts");
    expect(store.revealTick).toBe(before + 1);
  });

  test("direct child → select: keeps root + expansion, only selects, bumps revealTick", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    const before = store.revealTick;

    await store.revealFile("/root/a.ts");

    expect(store.rootPath).toBe("/root"); // root unchanged
    expect(store.expanded.size).toBe(0); // no ancestors expanded
    expect(store.selectedPath).toBe("a.ts");
    expect(store.revealTick).toBe(before + 1);
  });

  test("out of bounds → reroot at the file's directory, select it as a direct child, bump revealTick", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    const before = store.revealTick;

    await store.revealFile("/elsewhere/pkg/a.ts");

    expect(store.rootPath).toBe("/elsewhere/pkg"); // re-rooted at the file's own directory
    expect(store.selectedPath).toBe("a.ts"); // file is now a direct child of the new root
    expect(store.revealTick).toBe(before + 1);
  });

  test("no root yet → reroot at the file's directory and select it", async () => {
    const { data } = fakeData({ ".": [entry("a.ts", "file")] });
    const { store } = makeStore({ data });

    await store.revealFile("/fresh/dir/a.ts");

    expect(store.rootPath).toBe("/fresh/dir");
    expect(store.selectedPath).toBe("a.ts");
  });

  // revealFile's contract accepts an absolute file path. Empty/relative inputs name no valid external
  // target, so they must be rejected before the three-branch classifier can turn them into a destructive
  // re-root and erase the current tree context.
  test("ignores empty and non-absolute reveal targets without changing tree state", async () => {
    const listedRoots: string[] = [];
    const source = fakeData({ ".": [entry("kept.ts", "file")] }).data;
    const data: FileTreeData = {
      ...source,
      listDirectory: async (root, path) => {
        listedRoots.push(root);
        return source.listDirectory(root, path);
      },
    };
    const { store } = makeStore({ data });
    await store.ensureRoot({ externalRoot: "/root", conversationRoot: null });
    store.select("kept.ts");
    const before = store.revealTick;

    await store.revealFile("");
    await store.revealFile("relative.ts");

    expect(store.rootPath).toBe("/root");
    expect(store.selectedPath).toBe("kept.ts");
    expect(store.revealTick).toBe(before);
    expect(listedRoots).toEqual(["/root"]);
  });
});
