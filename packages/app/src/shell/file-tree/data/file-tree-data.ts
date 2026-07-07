// The file tree's data layer — the new directory's self-contained "connect to server" port
// (standards §8: connection wiring is rebuilt here, never borrowed from the old explorer hook /
// session-store). The store calls ONLY this layer, so every daemon RPC the tree needs is funneled
// through one place and the rest of the new directory stays free of client-call scatter.
//
// Isolation: the client is INJECTED (FileTreeRpcClient — the minimal RPC surface the tree uses), not
// imported from the old session-store. The shell wiring point reads the connected DaemonClient for a
// serverId and constructs this layer with it; a real DaemonClient satisfies FileTreeRpcClient
// structurally. The @getpaseo/client package is an allowed shared transport dep (§8 4.A), so its
// payload types back the shapes below, but the new directory still owns its TreeEntry/SearchMatch.

import type {
  FileExplorerDirectoryPayload,
  FsSearchResult,
} from "@getpaseo/client/internal/daemon-client";
import type { TreeEntry } from "../model/types";

// The exact, minimal slice of DaemonClient the tree consumes. Declared structurally so the data layer
// depends on a capability shape, not the concrete client — the shell injects a real DaemonClient (it
// satisfies this) and tests inject a fake. Signatures mirror DaemonClient's FS methods verbatim.
export interface FileTreeRpcClient {
  listDirectory(cwd: string, path: string): Promise<FileExplorerDirectoryPayload>;
  fsSearch(
    input: {
      root: string;
      query: string;
      mode: "name" | "content";
      basePath?: string;
      limit?: number;
    },
    opts?: { onProgress?: (matches: FsSearchResult["matches"]) => void },
  ): Promise<FsSearchResult>;
  fsCreate(root: string, path: string): Promise<{ path: string }>;
  fsMkdir(root: string, path: string): Promise<{ path: string }>;
  fsRename(root: string, path: string, newName: string): Promise<{ path: string }>;
  fsMove(root: string, from: string, toDir: string): Promise<{ path: string }>;
  fsCopy(root: string, from: string, toDir: string): Promise<{ path: string }>;
  fsDelete(root: string, path: string): Promise<{ path: string }>;
}

// A directory listing as the tree consumes it: the directory's path (root-relative, as the host
// returns it — "." for the root) plus its entries (also root-relative paths). `entries` are TreeEntry
// — structurally identical to the client payload's items, but the new directory's own type so it
// carries no legacy ExplorerEntry dependency.
export interface DirectoryListing {
  readonly path: string;
  // The host-resolved absolute directory path ("~"-free), when the daemon sends it (additive optional —
  // undefined for old daemons). The store captures the root listing's value as absoluteRoot to build
  // "~"-free absolute paths for reveal / copy-absolute, instead of joining the literal-"~" host root.
  readonly absolutePath?: string;
  readonly entries: ReadonlyArray<TreeEntry>;
}

// Input for a search request (name or content mode — both run on the host so results cover the
// whole tree root), minus the transport fields the layer fills.
export interface SearchInput {
  readonly root: string;
  readonly query: string;
  readonly mode: "name" | "content";
  readonly basePath?: string;
  readonly limit?: number;
}

// The data layer's public surface: one method per RPC the tree needs. The host normalizes "~"-relative
// roots (e.g. the desktop root the store passes) on every call via expandUserPath, so the client never
// assumes os.homedir — there is no separate "resolve desktop" round-trip (the list response's path is
// root-relative — "." for the root — and so cannot carry the absolute root anyway).
export interface FileTreeData {
  listDirectory(root: string, path: string): Promise<DirectoryListing>;
  // `onProgress` streams match batches as the host scan finds them (progressive preview); the
  // resolved result still carries the complete set — consumers replace on resolution.
  search(
    input: SearchInput,
    onProgress?: (matches: FsSearchResult["matches"]) => void,
  ): Promise<FsSearchResult>;
  createFile(root: string, path: string): Promise<string>;
  createDirectory(root: string, path: string): Promise<string>;
  rename(root: string, path: string, newName: string): Promise<string>;
  move(root: string, from: string, toDir: string): Promise<string>;
  copy(root: string, from: string, toDir: string): Promise<string>;
  del(root: string, path: string): Promise<string>;
}

// Build the data layer over an injected client. A plain factory (not a class) since the layer holds no
// state — it just adapts the tree's vocabulary to the client's RPCs.
export function createFileTreeData(client: FileTreeRpcClient): FileTreeData {
  return {
    // List a directory under `root` (which the host expands per call); `path` is root-relative ("." for
    // the root), and the response's `path` is the host's root-relative echo of that directory.
    async listDirectory(root, path) {
      const payload = await client.listDirectory(root, path);
      return { path: payload.path, absolutePath: payload.absolutePath, entries: payload.entries };
    },

    // Search under `root` in the requested mode (name matches entry names, content matches file
    // contents) — one host RPC for both so the whole root is covered regardless of what's expanded.
    search(input, onProgress) {
      return client.fsSearch(
        {
          root: input.root,
          query: input.query,
          mode: input.mode,
          ...(input.basePath !== undefined ? { basePath: input.basePath } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        },
        onProgress ? { onProgress } : undefined,
      );
    },

    // Create an empty file; returns the landed normalized path for the store to refresh/position by.
    async createFile(root, path) {
      const result = await client.fsCreate(root, path);
      return result.path;
    },

    // Create a directory; returns the landed normalized path.
    async createDirectory(root, path) {
      const result = await client.fsMkdir(root, path);
      return result.path;
    },

    // Rename an entry in place to `newName` (same directory); returns the new path.
    async rename(root, path, newName) {
      const result = await client.fsRename(root, path, newName);
      return result.path;
    },

    // Move (cut/paste) `from` into `toDir`; returns the landed path.
    async move(root, from, toDir) {
      const result = await client.fsMove(root, from, toDir);
      return result.path;
    },

    // Copy (copy/paste) `from` into `toDir`, recursing for directories; returns the landed path.
    async copy(root, from, toDir) {
      const result = await client.fsCopy(root, from, toDir);
      return result.path;
    },

    // Delete `path` (file or directory, recursive); returns the removed path for the store to refresh by.
    async del(root, path) {
      const result = await client.fsDelete(root, path);
      return result.path;
    },
  };
}
