// FileTreeStore — the file tree's single content truth source (class + MobX, mirroring ShellModel's
// style). It owns state + transitions only; every derivation is delegated to the Phase-1 pure functions
// (resolve-root / tree-reducer / search-state / inline-edit / clipboard-state / context-menu-items) and
// every IO call to the injected data layer + bridges. The store imports no React and no old feature
// module — the shell wires a connected client + context into it through FileTreeStoreDeps, keeping the
// new directory's hard isolation intact (standards §8). It is the implementation body of
// FileTreeController (file-tree-public.ts), exposed outward as a narrowed read-only + single-action view.
//
// Path space: the host filesystem RPCs are ROOT-RELATIVE — listDirectory/fs.* take a `root` (the cwd,
// expanded host-side per call) plus a path relative to it, and the host echoes entry/dir paths
// root-relative ("." for the root). The tree therefore operates entirely in root-relative space
// (`treeRoot`/`expanded`/`selectedPath`/cache keys/entry paths are all relative). `hostRoot` preserves the
// caller's cwd spelling for RPCs; `absoluteRoot` captures the daemon-expanded spelling from the root
// listing. Every outward absolute path is built from the canonical `rootPath` projection, so open/reveal
// never compare a literal "~" path against its expanded host path.

import { makeAutoObservable, observable, runInAction } from "mobx";
import type { FileTreeData, SearchInput } from "../data/file-tree-data";
import { afterPaste, canPaste, setCopy, setCut } from "./clipboard-state";
import { deriveContextMenuItems } from "./context-menu-items";
import { validateInlineName } from "./inline-edit";
import { resolveRevealAction } from "./reveal-action";
import { resolveTreeRoot } from "./resolve-root";
import {
  advanceSearch,
  advanceSearchRequest,
  INITIAL_SEARCH_REQUEST,
  isSearchAvailable,
  SEARCH_DEBOUNCE_MS,
  type SearchRequestState,
} from "./search-state";
import {
  buildVisibleNodes,
  foldDirectoryListing,
  selectPath,
  toggleExpandedPath,
} from "./tree-reducer";
import {
  buildAbsoluteTreePath,
  isAbsolutePath,
  parentDirectory,
  relativeToTreeRoot,
} from "../util/tree-paths";
import type {
  Clipboard,
  ContextMenuItem,
  Editing,
  SearchMatch,
  SearchState,
  TreeEntry,
  TreeNodeView,
} from "./types";

// The "~"-relative host path for the default desktop root. The host's expandUserPath normalizes it per
// RPC call, so the client never assumes os.homedir (that would show the wrong, local desktop).
const DESKTOP_HOST_ROOT = "~/Desktop";

// The root-relative path the host returns for the tree root's own listing (path.relative(root, root)).
const TREE_ROOT_PATH = ".";

// The composer seam's narrow contract (impl in composer-bridge.ts). The store produces "add this path
// to chat"; the bridge translates it. Declared here so the store depends on the seam shape, not the bridge.
export interface ComposerBridge {
  addPathToChat(input: { path: string; kind: "file" | "directory"; draftKey: string }): void;
}

// The right-tab seam's narrow contract (impl in right-tab-bridge.ts). The store produces "open this
// file location in the right tab"; the bridge does the layout wiring + degrade.
export interface RightTabBridge {
  openFileInRightTab(input: {
    location: { path: string; lineStart?: number; lineEnd?: number };
    workspaceId: string;
    serverId: string;
  }): void;
}

// The runtime context the store can't know on its own — the shell feeds it from the active session.
// Read fresh on each use so capability/draft/connection changes are reflected without store-side copies.
export interface FileTreeContext {
  readonly serverId: string;
  readonly workspaceId: string;
  readonly conversationRoot: string | null;
  readonly draftKey: string | null;
  readonly features: { fsSearch?: boolean; fsWrite?: boolean };
  readonly isElectron: boolean;
  readonly hasActiveDraft: boolean;
  readonly isOffline: boolean;
}

// Everything the store needs injected: the data layer (all RPC IO), the two bridges, the platform/util
// ports (reveal / clipboard / directory picker) as plain functions so the store carries no platform
// gate, and a context getter. Injection is what keeps the store testable and isolated from old modules.
export interface FileTreeStoreDeps {
  readonly data: FileTreeData;
  readonly composer: ComposerBridge;
  readonly rightTab: RightTabBridge;
  readonly revealInFinder: (path: string) => void;
  readonly copyToClipboard: (text: string) => void;
  readonly pickDirectory: () => Promise<string | null>;
  // Show a destructive-action confirmation (delete) and resolve true only if the user accepts. Injected
  // as a port so the store/components carry no platform dialog wiring (the seam supplies the real impl).
  readonly confirmDestructive: (input: ConfirmDeleteInput) => Promise<boolean>;
  readonly getContext: () => FileTreeContext;
}

// What the delete confirmation needs to render: the entry's display name and whether it is a directory
// (so the prompt can warn about recursive removal). Resolved from the tree's cached entry by name.
export interface ConfirmDeleteInput {
  readonly name: string;
  readonly isDirectory: boolean;
}

// The empty/idle search state the machine starts and resets to.
const IDLE_SEARCH: SearchState = { mode: "name", query: "", results: [], phase: "idle" };

export class FileTreeStore {
  // The caller-provided host root spelling, used as the cwd for every RPC. It may contain a literal "~";
  // outward absolute paths must use rootPath instead. null = no root defined yet.
  hostRoot: string | null = null;
  // The host-resolved absolute root ("~"-free), captured from the root listing's absolutePath. Used as
  // the base for absolute paths (reveal / copy-absolute) so a literal-"~" hostRoot (e.g. "~/Desktop")
  // never leaks into an unresolvable "~/Desktop/a.ts". null until the root lists (or old daemon omits it
  // → toAbsolute falls back to hostRoot, which is already absolute for external/conversation roots).
  absoluteRoot: string | null = null;
  rootSource: "external" | "conversation" | "desktop" | null = null;
  // Root-relative tree state (everything below is in the same relative space as the host's entry paths).
  expanded = new Set<string>();
  selectedPath: string | null = null;
  // Monotonic id bumped each time an external reveal command (revealFile) locates the selection, so the
  // view can scroll the selected row into view. A plain selectedPath watch would also fire on manual row
  // clicks (which must NOT auto-scroll), so the scroll trigger is this deliberate signal, not selection.
  revealTick = 0;
  dirCache = new Map<string, TreeEntry[]>();
  nodeLoading = new Set<string>();
  nodeError = new Map<string, string>();
  searchOpen = false;
  search: SearchState = IDLE_SEARCH;
  // True while a host search RPC is in flight — with progressive delivery the phase flips to
  // "results" on the first streamed batch, and this flag keeps the "仍在搜索" cue visible until the
  // final (complete) response settles.
  searchInFlight = false;
  contentSearchBasePath: string | null = null;
  clipboard: Clipboard | null = null;
  editing: Editing = null;
  contextMenu: {
    target: { kind: "blank" | "dir" | "file"; path?: string };
    anchor: { x: number; y: number };
  } | null = null;
  // True once the root listing has settled (success or failure); drives loading vs ready in panelState.
  private rootListed = false;
  // Set when the root listing itself failed (distinct from per-node errors) → panel error state.
  private rootError = false;
  // Pending debounced content-search timer; cleared/replaced when the query changes so only the latest
  // search fires (interrupts the prior one — the user's "change the query mid-search" case). Transient
  // wiring, not reactive state (excluded from observability below).
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  // Pure lifecycle ownership for the debounce boundary. A monotonically increasing token makes an old
  // timer ineligible to start after newer input or an explicit clear; IO settlement is added separately.
  private searchRequest: SearchRequestState = INITIAL_SEARCH_REQUEST;

  private readonly deps: FileTreeStoreDeps;

  constructor(deps: FileTreeStoreDeps) {
    this.deps = deps;
    // autoBind so actions keep `this` when handed straight to view handlers; deps excluded from
    // observability (it's an injected, immutable wiring bag, not reactive state). The Set/Map fields
    // are observable.ref: the store always replaces them with a fresh collection (reducer style), so
    // reference reactivity is exactly right and they stay plain JS Set/Map (not ObservableMap, whose
    // copy/iteration semantics differ) for the pure functions to consume directly.
    makeAutoObservable<this, "deps" | "searchRequest" | "searchTimer">(
      this,
      {
        deps: false,
        searchRequest: false,
        searchTimer: false,
        expanded: observable.ref,
        dirCache: observable.ref,
        nodeLoading: observable.ref,
        nodeError: observable.ref,
      },
      { autoBind: true },
    );
  }

  // ----- public face (FileTreeController) -----

  // The canonical root for every external path: daemon-expanded when the root listing provides it,
  // otherwise the original root (already absolute for external/conversation roots and old daemons).
  get rootPath(): string | null {
    return this.absoluteRoot ?? this.hostRoot;
  }

  // ----- computed (zero redundant state) -----

  // The flat, indented rows to render: expanded+cached dirs descended, inline draft placeholder folded
  // in. Pure projection over the store's own (root-relative) state via tree-reducer.
  get visibleNodes(): TreeNodeView[] {
    if (!this.hostRoot) {
      return [];
    }
    return buildVisibleNodes({
      rootPath: TREE_ROOT_PATH,
      expanded: this.expanded,
      cache: this.dirCache,
      selectedPath: this.selectedPath,
      nodeLoading: this.nodeLoading,
      nodeError: this.nodeError,
      editing: this.editing,
    });
  }

  // The tree-owned panel state (sFT6) by priority: error > loading > empty > ready. Host offline is
  // composed in the React mount from the live runtime hook; it is not a MobX observable, so reading it
  // here would let computed caching keep the panel stuck in a stale offline state after reconnect.
  get panelState(): "loading" | "empty" | "error" | "ready" {
    if (this.rootError) {
      return "error";
    }
    if (!this.hostRoot || !this.rootListed) {
      return "loading";
    }
    const rootEntries = this.dirCache.get(TREE_ROOT_PATH);
    if (rootEntries && rootEntries.length === 0 && !this.editing) {
      return "empty";
    }
    return "ready";
  }

  // The current search results (non-empty only in the results phase) for the result list + highlight.
  get searchResultsView(): ReadonlyArray<SearchMatch> {
    return this.search.phase === "results" ? this.search.results : [];
  }

  // Whether paste is currently available — true exactly when the clipboard holds an entry.
  get pasteEnabled(): boolean {
    return canPaste(this.clipboard);
  }

  // The siblings of the current inline-edit target's directory, for duplicate-name validation. New-*
  // validates against the parent dir's entries; rename validates against its directory's entries
  // EXCLUDING the rename target itself — so typing its own name back is not a false duplicate (a
  // same-name commit is a no-op restore in commitEdit), while a real collision with a different
  // sibling still errors.
  get currentSiblings(): ReadonlyArray<{ name: string }> {
    if (!this.editing) {
      return [];
    }
    if (this.editing.kind === "rename") {
      const original = this.editing.originalName;
      const siblings = this.dirCache.get(parentRelDir(this.editing.targetPath)) ?? [];
      return siblings.filter((entry) => entry.name !== original);
    }
    return this.dirCache.get(this.editing.parentPath) ?? [];
  }

  // ----- root + listing -----

  // Entry: resolve the root (external > conversation > desktop) and list its first level. Idempotent
  // once a root is set (re-entry won't re-list). Desktop defers to the host via the "~/Desktop" root.
  async ensureRoot(ctx: {
    externalRoot: string | null;
    conversationRoot: string | null;
  }): Promise<void> {
    if (this.hostRoot) {
      return;
    }
    const resolution = resolveTreeRoot(ctx);
    if (resolution.kind === "path") {
      const source = ctx.externalRoot?.trim() ? "external" : "conversation";
      await this.adoptRoot(resolution.path, source);
      return;
    }
    await this.adoptRoot(DESKTOP_HOST_ROOT, "desktop");
  }

  // Keep the default root in sync with the live conversation root after the panel has mounted.
  // Explicit external roots win: once the user picked a directory manually, conversation updates
  // no longer override it. Desktop fallback does follow the conversation when one appears.
  async syncConversationRoot(conversationRoot: string | null): Promise<void> {
    if (!this.hostRoot) {
      await this.ensureRoot({ externalRoot: null, conversationRoot });
      return;
    }
    if (this.rootSource === "external") {
      return;
    }
    const next = resolveTreeRoot({ externalRoot: null, conversationRoot });
    if (next.kind === "needDesktop") {
      if (this.rootSource !== "desktop" || this.hostRoot !== DESKTOP_HOST_ROOT) {
        await this.reroot(DESKTOP_HOST_ROOT, "desktop");
      }
      return;
    }
    if (this.rootSource !== "conversation" || this.hostRoot !== next.path) {
      await this.reroot(next.path, "conversation");
    }
  }

  // Public face entry (FileTreeController): re-root the tree at `rootPath`, clearing all view state
  // (expanded/selected/search/clipboard/editing) before listing the new root's first level.
  async showDirectory(rootPath: string): Promise<void> {
    await this.reroot(rootPath, "external");
  }

  // Re-list the current root while preserving its source (conversation / desktop). Used by the
  // toolbar's collapse-all action so clearing expansion does not silently convert a conversation /
  // desktop root into an external one.
  async refreshCurrentRoot(): Promise<void> {
    if (!this.hostRoot) {
      return;
    }
    await this.reroot(this.hostRoot, this.rootSource ?? "external");
  }

  // Set the host root + list its first level (root-relative path "."), recording the source and
  // clearing any prior root error. The listing's entries are cached under the relative root key.
  private async adoptRoot(
    hostRoot: string,
    source: "external" | "conversation" | "desktop",
  ): Promise<void> {
    runInAction(() => {
      this.hostRoot = hostRoot;
      this.absoluteRoot = null;
      this.rootSource = source;
      this.rootError = false;
      this.rootListed = false;
    });
    try {
      const listing = await this.deps.data.listDirectory(hostRoot, TREE_ROOT_PATH);
      const resolvedRoot = listing.absolutePath?.trim() ?? null;
      const hasResolvedRoot = resolvedRoot !== null && isAbsolutePath(resolvedRoot);
      runInAction(() => {
        this.dirCache = foldDirectoryListing(this.dirCache, TREE_ROOT_PATH, [...listing.entries]);
        // listDirectory is where the host expands "~". Once it settles, all outward paths use this exact
        // representation; old daemons may omit it, so already-absolute host roots remain the fallback.
        this.absoluteRoot = hasResolvedRoot ? resolvedRoot : null;
        this.rootListed = true;
      });
    } catch {
      runInAction(() => {
        this.rootError = true;
        this.rootListed = true;
      });
    }
  }

  // Reset all transient view state before adopting a new root. The old root is cleared first so the
  // panel can't briefly paint stale content while the replacement listing is in flight.
  private resetForRootChange(): void {
    this.cancelSearchRequest();
    runInAction(() => {
      this.expanded = new Set();
      this.selectedPath = null;
      this.dirCache = new Map();
      this.nodeLoading = new Set();
      this.nodeError = new Map();
      this.searchOpen = false;
      this.search = IDLE_SEARCH;
      this.contentSearchBasePath = null;
      this.clipboard = null;
      this.editing = null;
      this.hostRoot = null;
      this.absoluteRoot = null;
      this.rootSource = null;
      this.rootListed = false;
      this.rootError = false;
    });
  }

  // Re-root the tree with a clean slate only for a concrete directory. Invalid blank input is rejected
  // before reset so a bad external/reveal target cannot erase the current tree context.
  private async reroot(
    rootPath: string,
    source: "external" | "conversation" | "desktop",
  ): Promise<void> {
    const normalizedRoot = rootPath.trim();
    if (!normalizedRoot) {
      return;
    }
    this.resetForRootChange();
    await this.adoptRoot(normalizedRoot, source);
  }

  // Expand/collapse a directory; list it on first expand (marking node loading, folding children into
  // the cache, recording a node error on failure). `path` is root-relative, passed straight to the RPC.
  async toggleExpand(path: string): Promise<void> {
    const willExpand = !this.expanded.has(path);
    runInAction(() => {
      this.expanded = toggleExpandedPath(this.expanded, path);
    });
    if (!willExpand || this.dirCache.has(path) || !this.hostRoot) {
      return;
    }
    runInAction(() => {
      this.nodeLoading = withAdded(this.nodeLoading, path);
      this.nodeError = withDeleted(this.nodeError, path);
    });
    try {
      const listing = await this.deps.data.listDirectory(this.hostRoot, path);
      runInAction(() => {
        this.dirCache = foldDirectoryListing(this.dirCache, path, [...listing.entries]);
        this.nodeError = withDeleted(this.nodeError, path);
      });
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, path, messageOf(error));
      });
    } finally {
      runInAction(() => {
        this.nodeLoading = withSetDeleted(this.nodeLoading, path);
      });
    }
  }

  // Select a file (single-select, mutually exclusive). The selection is readable for the right-side
  // file tab to consume later. Pure selection: it does NOT open a right tab, so the reverse reveal
  // (file tab → tree locate) can reuse it without looping back into another open.
  select(path: string): void {
    this.selectedPath = selectPath(this.selectedPath, path);
  }

  // The explicit file-row click (联动2): select the file AND open/focus its right-panel tab. This is the
  // ONE hook that opens the right tab for an already-existing file — bound to the deliberate click, not to
  // select() (which the reverse reveal fires) so arrow/reveal navigation never spuriously opens tabs.
  activateFile(path: string): void {
    this.select(path);
    this.openInRightTab(path);
  }

  // Retry the failed root listing (sFT6 error exit). A valid failed root is retried in place; a missing or
  // corrupted blank root re-enters the normal conversation→desktop default-root flow so retry is never dead.
  async retry(): Promise<void> {
    const failedRoot = this.hostRoot?.trim();
    if (failedRoot) {
      await this.adoptRoot(failedRoot, this.rootSource ?? "external");
      return;
    }
    this.resetForRootChange();
    await this.ensureRoot({
      externalRoot: null,
      conversationRoot: this.deps.getContext().conversationRoot,
    });
  }

  // Collapse every expanded directory back to the root's first level (the toolbar's 折叠全部).
  // ONLY the expand set resets — selection, search, clipboard, inline editing and the listing cache
  // all survive. (Review 2026-07-07: the toolbar used to reuse the re-root path for this, which
  // silently reset selection/search and refetched the root — heavier than the button's semantics.)
  collapseAll(): void {
    this.expanded = new Set();
  }

  // Refresh the visible tree from disk (the toolbar's 刷新): relist the root AND every
  // still-expanded directory — retry() only relists the root, which left expanded layers stale.
  // Failures land as per-node errors via the shared relist path; an active search re-runs after,
  // same freshness contract as the write operations.
  async refreshTree(): Promise<void> {
    if (!this.hostRoot) {
      return;
    }
    await this.relist(TREE_ROOT_PATH);
    for (const dir of this.expanded) {
      await this.relist(dir);
    }
    runInAction(() => {
      this.rerunActiveSearch();
    });
  }

  // ----- search -----

  // Toggle the search surface from the toolbar. Closing it clears query/results and the hidden content
  // scope so the next open starts as a plain root search.
  toggleSearchPanel(): void {
    if (this.searchOpen) {
      this.searchOpen = false;
      this.clearSearch();
      return;
    }
    this.searchOpen = true;
  }

  // Switch search mode. Both modes need the host's fsSearch capability (they search the whole tree
  // root on the host); without it the machine goes straight to the error phase (prompt to upgrade
  // host) — no degraded client-side filter is attempted (feature contract: no fallback paths).
  setSearchMode(mode: "name" | "content"): void {
    this.contentSearchBasePath = null;
    if (!isSearchAvailable(this.deps.getContext().features)) {
      this.cancelSearchRequest();
      this.search = advanceSearch({ ...this.search, mode }, { type: "error", kind: "unsupported" });
      return;
    }
    const next = advanceSearch(this.search, { type: "mode-changed", mode });
    this.search = next;
    if (next.phase === "searching") {
      this.runSearch(next);
    } else {
      this.cancelSearchRequest();
    }
  }

  // Set the query and advance the machine: both modes dispatch the (debounced) fs.search RPC; an
  // empty query returns to idle. Any prior pending search is cancelled first, so a new keystroke
  // interrupts the previous one.
  setQuery(query: string): void {
    const next = advanceSearch(this.search, { type: "query-changed", query });
    if (next.phase === "idle") {
      this.contentSearchBasePath = null;
    }
    this.search = next;
    if (next.phase === "searching") {
      this.runSearch(next);
    } else {
      this.cancelSearchRequest();
    }
  }

  // Clear search, returning to the plain tree (sFT4/5 exit).
  clearSearch(): void {
    this.cancelSearchRequest();
    this.contentSearchBasePath = null;
    this.search = advanceSearch(this.search, { type: "clear" });
  }

  // Run the active query and settle the machine with results/empty/error. Both modes go through the
  // debounced host RPC so the search covers the WHOLE tree root (unexpanded layers included) — the
  // architecture's earlier client-side name filter only saw already-listed nodes and missed the rest.
  private runSearch(state: SearchState): void {
    if (!isSearchAvailable(this.deps.getContext().features)) {
      this.cancelSearchRequest();
      this.search = advanceSearch(state, { type: "error", kind: "unsupported" });
      return;
    }
    if (!this.hostRoot) {
      this.cancelSearchRequest();
      // No root resolved yet is a run-time condition, not a capability gap — "failed" copy (retry).
      this.search = advanceSearch(state, { type: "error", kind: "failed" });
      return;
    }
    this.scheduleSearch(state);
  }

  // Debounce the fs.search RPC: arm a timer that fires the search only after the user pauses, and
  // only if this query/mode is still active when it fires. A burst of keystrokes thus spawns ONE host
  // search, not one per character.
  private scheduleSearch(state: SearchState): void {
    this.clearSearchTimer();
    this.searchRequest = advanceSearchRequest(this.searchRequest, { type: "schedule" });
    const token = this.searchRequest.latestToken;
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      const next = advanceSearchRequest(this.searchRequest, {
        type: "debounce-elapsed",
        token,
      });
      if (next === this.searchRequest) {
        return;
      }
      this.searchRequest = next;
      void this.runHostSearch(state);
    }, SEARCH_DEBOUNCE_MS);
  }

  // Clear the physical debounce timer before it can dispatch; request ownership is modeled separately.
  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  // Cancel scheduled/running ownership immediately so an old debounce callback cannot start host IO.
  private cancelSearchRequest(): void {
    this.clearSearchTimer();
    this.searchRequest = advanceSearchRequest(this.searchRequest, { type: "cancel" });
  }

  // Re-run the active search after a tree write (create/rename/move/copy/delete) so the result list
  // reflects the just-changed names/contents. There is NO index anywhere — every search scans the
  // live filesystem — so a re-run IS the freshness mechanism. This hook also covers the upcoming
  // file-editing feature: any future save path calls it and search can never show stale hits.
  // No-op when the search is closed, idle, or gated on a missing capability.
  private rerunActiveSearch(): void {
    if (!this.searchOpen || !this.search.query.trim()) {
      return;
    }
    if (this.search.phase === "error" && this.search.errorKind === "unsupported") {
      return;
    }
    const next = advanceSearch(this.search, {
      type: "query-changed",
      query: this.search.query,
    });
    this.search = next;
    if (next.phase === "searching") {
      this.runSearch(next);
    }
  }

  // Fire the fs.search RPC for the state's mode and settle the machine on resolution, ignoring a
  // stale result if the user changed the query/mode since this request started (last-query-wins, no
  // out-of-order flash). The find-in-files base path only scopes content mode; name mode always
  // searches from the root. Progressive: streamed batches append into the results as previews
  // (first hits paint sub-second); the final response replaces them with the complete set.
  private async runHostSearch(state: SearchState): Promise<void> {
    const input: SearchInput = {
      root: this.hostRoot as string,
      query: state.query,
      mode: state.mode,
      ...(state.mode === "content" && this.contentSearchBasePath
        ? { basePath: this.contentSearchBasePath }
        : {}),
    };
    const isCurrent = (): boolean =>
      this.search.query === state.query && this.search.mode === state.mode;
    this.searchInFlight = true;
    try {
      const result = await this.deps.data.search(input, (matches) => {
        runInAction(() => {
          if (isCurrent()) {
            this.search = advanceSearch(this.search, { type: "progress", matches });
          }
        });
      });
      runInAction(() => {
        if (!isCurrent()) {
          return;
        }
        this.search = advanceSearch(
          this.search,
          result.matches.length > 0
            ? { type: "results", matches: result.matches }
            : { type: "empty" },
        );
      });
    } catch {
      runInAction(() => {
        if (isCurrent()) {
          // The RPC ran and broke (timeout / disconnect / host error) — "failed" copy, not the
          // capability-upgrade prompt.
          this.search = advanceSearch(this.search, { type: "error", kind: "failed" });
        }
      });
    } finally {
      runInAction(() => {
        this.searchInFlight = false;
      });
    }
  }

  // Reveal a search result on the tree: expand the ancestor chain down to the path and select it.
  revealPath(path: string): void {
    runInAction(() => {
      for (const ancestor of ancestorRelChain(path)) {
        this.expanded = withAdded(this.expanded, ancestor);
      }
      this.selectedPath = path;
    });
  }

  // Activate a search result: every hit is revealed in the tree, while file hits also open/focus the
  // right-side tab. Content-hit lines become the editor reveal range; directories remain tree-only.
  activateSearchResult(match: SearchMatch): void {
    this.revealPath(match.path);
    if (match.kind === "directory") {
      return;
    }
    this.openInRightTab(match.path, match.line);
  }

  // Public face (FileTreeController): locate a valid absolute file target when its tab activates. Invalid
  // targets stop at this boundary; valid targets enter the three pinned reveal/select/reroot branches and
  // bump revealTick so the view scrolls the located row into view (requirement §3.2 / item 23, M18).
  async revealFile(absPath: string): Promise<void> {
    const targetAbsPath = absPath.trim();
    if (!isAbsolutePath(targetAbsPath)) {
      return;
    }
    const currentRoot = this.rootPath;
    const { action } = resolveRevealAction({ targetAbsPath, currentRoot });

    if (action === "reroot") {
      // Out of bounds: re-show the tree rooted at the file's own directory, then select the file — now a
      // direct child of the new root. Selection is set after the reroot so it survives the state reset.
      const newRoot = parentDirectory(targetAbsPath);
      await this.reroot(newRoot, "external");
      runInAction(() => {
        const base = this.rootPath ?? newRoot;
        this.selectedPath = relativeToTreeRoot({ treeRoot: base, absolutePath: targetAbsPath });
        this.revealTick += 1;
      });
      return;
    }

    const relPath = relativeToTreeRoot({
      treeRoot: currentRoot as string,
      absolutePath: targetAbsPath,
    });
    if (action === "reveal") {
      this.revealPath(relPath);
    } else {
      this.select(relPath);
    }
    this.revealTick += 1;
  }

  // Begin a content search scoped to a file/directory (right-click "find in files").
  findInFiles(path: string): void {
    if (!this.hostRoot) {
      return;
    }
    this.cancelSearchRequest();
    this.searchOpen = true;
    this.contentSearchBasePath = findInFilesBasePath(path);
    // Reset to an idle content search THROUGH the machine (clear keeps the mode + empties the
    // query → idle; mode-changed flips to content) — the store never hand-builds a search state.
    this.search = advanceSearch(advanceSearch(this.search, { type: "clear" }), {
      type: "mode-changed",
      mode: "content",
    });
    if (!isSearchAvailable(this.deps.getContext().features)) {
      this.search = advanceSearch(this.search, { type: "error", kind: "unsupported" });
    }
  }

  // ----- switch directory -----

  // Switch the root via the native picker: a chosen path re-roots through showDirectory; a cancel
  // (null) leaves the current root untouched (the cancel fork); a failed listing lands in error.
  async pickAndShowDirectory(): Promise<void> {
    const picked = await this.deps.pickDirectory();
    if (picked === null) {
      return;
    }
    await this.showDirectory(picked);
  }

  // ----- context menu -----

  // Open the right-click menu at an anchor. The item list is NOT stored — it is derived live by
  // deriveMenu when the view paints, so there is no redundant menu state to keep in sync.
  openContextMenu(
    target: { kind: "blank" | "dir" | "file"; path?: string },
    anchor: { x: number; y: number },
  ): void {
    this.contextMenu = { target, anchor };
  }

  // Close the menu (item click / outside click / Esc all route here).
  closeContextMenu(): void {
    this.contextMenu = null;
  }

  // Derive the visible+enabled menu items for a target from the current clipboard/platform/draft/write
  // context. Live selector (not state) — the single place menu visibility/enabling is decided.
  deriveMenu(target: { kind: "blank" | "dir" | "file"; path?: string }): ContextMenuItem[] {
    const ctx = this.deps.getContext();
    return deriveContextMenuItems({
      target,
      hasClipboard: this.pasteEnabled,
      isElectron: ctx.isElectron,
      hasActiveDraft: ctx.hasActiveDraft,
      fsWriteAvailable: ctx.features.fsWrite === true,
    });
  }

  // ----- clipboard -----

  cut(path: string): void {
    this.clipboard = setCut(path);
  }

  copy(path: string): void {
    this.clipboard = setCopy(path);
  }

  // Paste into a directory: move (cut) or copy (copy) per the clipboard mode, then relist the target
  // dir from the server (no optimistic tree edit). Cut clears the clipboard; copy keeps it. All paths
  // are root-relative, passed straight to the RPC.
  async paste(targetDir: string): Promise<void> {
    const clipboard = this.clipboard;
    if (!clipboard || !this.hostRoot) {
      return;
    }
    const sourceDir = parentRelDir(clipboard.path);
    try {
      if (clipboard.mode === "cut") {
        await this.deps.data.move(this.hostRoot, clipboard.path, targetDir);
      } else {
        await this.deps.data.copy(this.hostRoot, clipboard.path, targetDir);
      }
      runInAction(() => {
        this.clipboard = afterPaste(clipboard);
      });
      await this.relist(sourceDir);
      await this.relist(targetDir);
      runInAction(() => {
        this.rerunActiveSearch();
      });
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, targetDir, messageOf(error));
      });
    }
  }

  // ----- delete -----

  // The confirm-then-delete entry the view dispatches for the menu's "delete" item. Delete is
  // destructive, so this asks for confirmation first (via the injected port, with the entry's name +
  // kind for the prompt) and only proceeds to deleteEntry on accept. The confirmation/decision lives
  // here (model-driven) so the component just dispatches requestDelete and carries no confirm branch.
  async requestDelete(path: string): Promise<void> {
    if (!this.hostRoot) {
      return;
    }
    const confirmed = await this.deps.confirmDestructive({
      name: baseName(path),
      isDirectory: this.isDirectoryPath(path),
    });
    if (!confirmed) {
      return;
    }
    await this.deleteEntry(path);
  }

  // Delete a file/directory (the destructive structure write; requestDelete confirms before calling).
  // On success, relist the containing directory so the server truth (entry gone) appears — no optimistic
  // tree edit. On failure, record a node error on the parent and leave the tree intact. Path is
  // root-relative, passed straight to the RPC.
  async deleteEntry(path: string): Promise<void> {
    if (!this.hostRoot) {
      return;
    }
    const dir = parentRelDir(path);
    try {
      await this.deps.data.del(this.hostRoot, path);
      await this.relist(dir);
      runInAction(() => {
        this.rerunActiveSearch();
      });
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, dir, messageOf(error));
      });
    }
  }

  // ----- inline new / rename -----

  // Begin an inline new file/folder: place the editing placeholder (empty draft, no RPC, nothing on
  // disk). `parentPath` is root-relative. The view inserts the draft row inside it and focuses it.
  beginNew(kind: "new-file" | "new-folder", parentPath: string): void {
    this.editing = { kind, parentPath, draftName: "", error: null };
  }

  // Begin an inline rename: the target row becomes an input seeded with the original name (the view
  // focuses it, main name selected). originalName is kept for the restore-on-cancel semantics.
  beginRename(path: string): void {
    this.editing = {
      kind: "rename",
      targetPath: path,
      originalName: baseName(path),
      draftName: baseName(path),
      error: null,
    };
  }

  // Update the inline draft name and re-validate, refilling the row-level error. Typing is never
  // blocked here; the error only gates what commit/cancel do on exit.
  setDraftName(name: string): void {
    if (!this.editing) {
      return;
    }
    const result = validateInlineName({
      name,
      siblings: this.currentSiblings,
      kind: this.editing.kind,
    });
    const error = result.ok ? null : result.error;
    this.editing = { ...this.editing, draftName: name, error };
  }

  // Commit the inline edit. New-*: a legal name creates (fs.create/fs.mkdir), then relists the parent
  // and (new-file only) opens the file in the right tab; an illegal/empty/duplicate name discards the
  // placeholder (never silently creates). Rename: a legal name ≠ original renames; an illegal name
  // keeps the editor open with the error; a name == original restores. All exits route through here or
  // cancelEdit — the view maps Enter/blur to one of the two by editing.kind + error (§3.10).
  async commitEdit(): Promise<void> {
    const editing = this.editing;
    if (!editing || !this.hostRoot) {
      return;
    }
    const result = validateInlineName({
      name: editing.draftName,
      siblings: this.currentSiblings,
      kind: editing.kind,
    });

    if (editing.kind === "rename") {
      if (!result.ok) {
        runInAction(() => {
          this.editing = { ...editing, error: result.error };
        });
        return;
      }
      const trimmed = editing.draftName.trim();
      if (trimmed === editing.originalName) {
        this.cancelEdit();
        return;
      }
      await this.commitRename(editing.targetPath, trimmed);
      return;
    }

    // new-file / new-folder: illegal → discard the placeholder (no RPC, no file).
    if (!result.ok) {
      this.cancelEdit();
      return;
    }
    await this.commitNew(editing.kind, editing.parentPath, editing.draftName.trim());
  }

  // Cancel the inline edit: new-* discards the placeholder (creates nothing), rename restores the
  // original name. This is the single non-commit exit; Esc/blur/outside-click all map here.
  cancelEdit(): void {
    this.editing = null;
  }

  // Create the new file/folder, then relist its parent so the server truth (not an optimistic guess)
  // appears. On success, a new FILE also opens in the right tab (folders do not). On failure, the
  // parent gets a node error and the editor closes. Paths stay root-relative for the RPC.
  private async commitNew(
    kind: "new-file" | "new-folder",
    parentPath: string,
    name: string,
  ): Promise<void> {
    runInAction(() => {
      this.editing = null;
    });
    const hostRoot = this.hostRoot as string;
    try {
      const childRelPath = joinRelPath(parentPath, name);
      const landed =
        kind === "new-file"
          ? await this.deps.data.createFile(hostRoot, childRelPath)
          : await this.deps.data.createDirectory(hostRoot, childRelPath);
      await this.relist(parentPath);
      runInAction(() => {
        this.rerunActiveSearch();
      });
      if (kind === "new-file") {
        this.openInRightTab(landed);
      }
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, parentPath, messageOf(error));
      });
    }
  }

  // Rename the target, then relist its parent. On failure the parent gets a node error.
  private async commitRename(targetPath: string, newName: string): Promise<void> {
    runInAction(() => {
      this.editing = null;
    });
    const dir = parentRelDir(targetPath);
    try {
      await this.deps.data.rename(this.hostRoot as string, targetPath, newName);
      await this.relist(dir);
      runInAction(() => {
        this.rerunActiveSearch();
      });
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, dir, messageOf(error));
      });
    }
  }

  // ----- cross-module + path actions -----

  // Add a path to the active chat composer via the bridge (file → attachment, directory → text). A
  // no-op without a draft key (the menu item is already disabled in that case). The bridge receives the
  // absolute host path so the composer can reference the real host file.
  addToChat(path: string, kind: "file" | "directory"): void {
    const draftKey = this.deps.getContext().draftKey;
    if (!draftKey) {
      return;
    }
    this.deps.composer.addPathToChat({ path: this.toAbsolute(path), kind, draftKey });
  }

  // Reveal a path in the OS file manager via the injected reveal port (Electron-only; the menu item is
  // disabled off-desktop, so this is only reached on desktop). Reveal needs the absolute host path.
  revealInFinder(path: string): void {
    this.deps.revealInFinder(this.toAbsolute(path));
  }

  // Copy a path to the clipboard: absolute (joined under the host root) or relative (the path itself,
  // already root-relative). The port write is delegated to the injected clipboard function.
  copyPath(path: string, relative: boolean): void {
    this.deps.copyToClipboard(relative ? path : this.toAbsolute(path));
  }

  // Open a root-relative file path in the right tab (联动2), optionally revealing one matched line.
  // Every caller shares the canonical absolute-path conversion, so tab identity stays deduplicated.
  openInRightTab(path: string, line?: number): void {
    const ctx = this.deps.getContext();
    const location = {
      path: this.toAbsolute(path),
      ...(line !== undefined ? { lineStart: line, lineEnd: line } : {}),
    };
    this.deps.rightTab.openFileInRightTab({
      location,
      workspaceId: ctx.workspaceId,
      serverId: ctx.serverId,
    });
  }

  // ----- helpers -----

  // Re-fetch a directory from the server and fold it into the cache (the post-write refresh path).
  private async relist(dir: string): Promise<void> {
    if (!this.hostRoot) {
      return;
    }
    try {
      const listing = await this.deps.data.listDirectory(this.hostRoot, dir);
      runInAction(() => {
        this.dirCache = foldDirectoryListing(this.dirCache, dir, [...listing.entries]);
        this.nodeError = withDeleted(this.nodeError, dir);
      });
    } catch (error) {
      runInAction(() => {
        this.nodeError = withSet(this.nodeError, dir, messageOf(error));
      });
    }
  }

  // Build the absolute host path for a root-relative tree path (for reveal / copy-path / composer).
  // Prefer the host-resolved absoluteRoot ("~"-free) so a literal-"~" hostRoot (e.g. "~/Desktop") never
  // produces an unresolvable "~/Desktop/a.ts"; fall back to hostRoot when the daemon omits absoluteRoot
  // (old daemon) — for external/conversation roots hostRoot is already absolute, so the join is correct.
  private toAbsolute(relPath: string): string {
    const base = this.rootPath;
    if (!base) {
      return relPath;
    }
    return buildAbsoluteTreePath({ treeRoot: base, entryPath: relPath });
  }

  // Whether the entry at a root-relative path is a directory, read from its parent dir's cached listing
  // (defaults to false if not yet listed). Used to phrase the delete confirmation (recursive warning).
  private isDirectoryPath(path: string): boolean {
    const siblings = this.dirCache.get(parentRelDir(path)) ?? [];
    return siblings.find((entry) => entry.path === path)?.kind === "directory";
  }
}

// Immutable Set/Map helpers — every transition produces a fresh collection so MobX sees a new reference
// (the store assigns whole collections rather than mutating in place, matching the reducer style).
function withAdded(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  next.add(value);
  return next;
}
function withSetDeleted(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  next.delete(value);
  return next;
}
function withDeleted<V>(map: ReadonlyMap<string, V>, key: string): Map<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
function withSet<V>(map: ReadonlyMap<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(map);
  next.set(key, value);
  return next;
}

// The final path segment (the entry's own name), for rename seeding + base-name comparisons.
function baseName(path: string): string {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

// The parent directory of a root-relative path; entries directly under the root collapse to ".".
function parentRelDir(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? TREE_ROOT_PATH : path.slice(0, index);
}

// "Find in files" is exposed on the blank/root target and file rows. Blank searches the current root;
// a file searches its containing directory (root for top-level files) so the user can find related
// references without narrowing to the file's own bytes.
function findInFilesBasePath(path: string): string | null {
  const parent = path === TREE_ROOT_PATH ? TREE_ROOT_PATH : parentRelDir(path);
  return parent === TREE_ROOT_PATH ? null : parent;
}

// Join a child name onto a root-relative parent dir; under the root ("."), the child is just its name.
function joinRelPath(parent: string, name: string): string {
  if (parent === TREE_ROOT_PATH || parent === "") {
    return name;
  }
  return `${parent}/${name}`;
}

// The chain of root-relative ancestor directories of a path (excluding the path itself), for
// reveal-path expansion: "a/b/c.ts" → ["a", "a/b"].
function ancestorRelChain(path: string): string[] {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const chain: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    chain.push(segments.slice(0, i + 1).join("/"));
  }
  return chain;
}

// A readable message off an unknown thrown value, for node-level error display.
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
