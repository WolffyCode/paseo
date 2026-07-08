// FileDocumentModel — one open file tab's domain object (MobX class, implements TabContent). It owns the
// whole life cycle of a single open file: load, kind, the last-saved baseline mtime (ONLY the mtime — the
// content lives in the editor buffer, never mirrored here), the blur-autosave lifecycle, markdown
// view, the find session, and external-conflict resolution. IO and the live editor buffer are injected
// ports, so the model is fully unit-testable without an editor or a socket. Every derivation is delegated
// to this directory's pure functions (classifyDocumentKind / advanceFind).

import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";
import { makeAutoObservable, runInAction } from "mobx";
import type { FileLocation } from "../../model/file-location";
import type { ActivityDot, TabContent } from "../../model/tab-content";
import { classifyDocumentKind, type DocumentKind } from "./document-kind";
import { advanceFind, type FindSessionState, IDLE_FIND } from "./find-state";
import { toImageDataUri } from "./image-data";

// The content-write RPC input (defined here — the file-tab module owns this port shape). expectedModifiedAt
// = the baseline mtime; the host compares it against the on-disk mtime as the conflict guard.
export interface WriteFileInput {
  root: string;
  path: string;
  content: string;
  expectedModifiedAt: string;
}

// The write outcome as a discriminated union the model switches on directly: ok advances the baseline; a
// conflict carries the host mtime for the resolve flow; denied/unavailable are non-blocking failures.
export type WriteFileResult =
  | { ok: true; modifiedAt: string }
  | { ok: false; reason: "conflict"; hostModifiedAt: string }
  | { ok: false; reason: "denied" | "unavailable" };

// The injected IO port: read (existing file-explorer channel) + content write (new fs.write capability).
export interface FileTabIo {
  readFile(cwd: string, path: string): Promise<FileReadResult>;
  writeFile(input: WriteFileInput): Promise<WriteFileResult>;
}

// The live editor buffer handle (wired by the editor adapter at onReady). The model never mirrors the
// content: it PULLS on save (getContent) and PUSHES host content on reload/initial-seed (applyExternalContent).
export interface EditorHandle {
  getContent(): string;
  applyExternalContent(text: string): void;
}

// What the model is constructed with: the host cwd, the file location, and whether the host can write
// content (the capability gate — false → read-only "update host").
export interface FileDocumentInit {
  readonly root: string;
  readonly location: FileLocation;
  readonly writeCapable: boolean;
}

// The injected ports (IO, editor buffer, tree reveal).
export interface FileDocumentDeps {
  readonly io: FileTabIo;
  readonly editor: EditorHandle;
  readonly revealFile: (path: string) => void;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

// The blur-autosave lifecycle as a discriminated union so impossible states can't be expressed (there is
// no ⌘S / save button — these states are all reachable only through edit + blur).
export type SaveLifecycle =
  | { status: "clean" }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "failed" };

// The external-conflict state: the host mtime that beat us, plus an optional pulled host content for the
// side-by-side compare view.
export interface ConflictState {
  hostModifiedAt: string;
  comparing: { hostContent: string } | null;
}

// Why the tab is read-only: image/binary have no edit affordance; capability = the host can't write content.
type ReadOnlyReason = "image" | "binary" | "capability";

export class FileDocumentModel implements TabContent {
  readonly root: string;
  readonly path: string;

  loadState: LoadState = "idle";
  kind: DocumentKind = "text";
  baseline: { modifiedAt: string } | null = null;
  save: SaveLifecycle = { status: "clean" };
  mdView: "preview" | "edit" = "preview";
  findOpen = false;
  find: FindSessionState = IDLE_FIND;
  conflict: ConflictState | null = null;
  readOnlyReason: ReadOnlyReason | null;
  // The decoded image as a data URI, set on load ONLY for the image kind (which has no editor buffer, so
  // the model is the sole home for its content). null for every other kind.
  imageDataUri: string | null = null;

  private readonly deps: FileDocumentDeps;
  // Single-flight guard: set when a blur/edit arrives during an in-flight save, so exactly one follow-up
  // save fires after it settles (never a second concurrent write). Transient wiring, not reactive state.
  private savePending = false;

  constructor(init: FileDocumentInit, deps: FileDocumentDeps) {
    this.root = init.root;
    this.path = init.location.path;
    this.deps = deps;
    this.readOnlyReason = init.writeCapable ? null : "capability";
    makeAutoObservable<this, "deps" | "savePending">(
      this,
      { deps: false, savePending: false },
      { autoBind: true },
    );
  }

  // ----- TabContent surface (read live by the tab head + framework) -----

  // The tab title = the file name (last path segment). Truncation is a render concern.
  get title(): string {
    const segments = this.path.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? this.path;
  }

  // The activity dot: dirty exactly while there are un-written edits.
  get activityDot(): ActivityDot {
    return this.save.status === "dirty" ? "dirty" : "none";
  }

  // Focused/switched-to → reveal the file in the tree (the three-branch reveal/reroot decision belongs to
  // file-tree; the model only issues the command).
  onActivated(): void {
    this.deps.revealFile(this.path);
  }

  // Closing/leaving → blur = autosave (synchronous intent; never blocks the close).
  onClosing(): void {
    this.autosaveOnBlur();
  }

  // ----- load -----

  // Read the file, classify how it renders, seed the editable buffer (text kinds only), and record the
  // baseline mtime. Image/binary become read-only (no buffer). Errors land in the error state.
  async load(): Promise<void> {
    runInAction(() => {
      this.loadState = "loading";
    });
    let result: FileReadResult;
    try {
      result = await this.deps.io.readFile(this.root, this.path);
    } catch {
      runInAction(() => {
        this.loadState = "error";
      });
      return;
    }
    runInAction(() => {
      this.kind = classifyDocumentKind({ path: this.path, readKind: result.kind });
      this.baseline = { modifiedAt: result.modifiedAt };
      if (this.kind === "image" || this.kind === "binary") {
        this.readOnlyReason ??= this.kind;
        if (this.kind === "image") {
          this.imageDataUri = toImageDataUri(result.bytes, result.mime);
        }
      } else {
        this.deps.editor.applyExternalContent(decodeText(result.bytes));
      }
      this.loadState = "loaded";
    });
  }

  // ----- edit + autosave -----

  // The editor reports an edit → mark dirty. On a read-only tab it is ignored; during an in-flight save it
  // only arms the single-flight follow-up (the "saving" status is kept).
  markEdited(): void {
    if (this.readOnlyReason) {
      return;
    }
    if (this.save.status === "saving") {
      this.savePending = true;
      return;
    }
    this.save = { status: "dirty" };
  }

  // Blur (tab switch / window blur / click-outside / close) → autosave. During an in-flight save it arms
  // the follow-up instead of racing a second write; otherwise it saves when there are unsaved changes
  // (dirty, or a prior failure to retry).
  autosaveOnBlur(): void {
    if (this.readOnlyReason) {
      return;
    }
    if (this.save.status === "saving") {
      this.savePending = true;
      return;
    }
    if (this.save.status === "dirty" || this.save.status === "failed") {
      void this.performSave();
    }
  }

  // ----- markdown view -----

  // Flip markdown preview⇄edit. The editor buffer is untouched, so unsaved changes survive the toggle.
  toggleMdView(): void {
    if (this.kind !== "markdown") {
      return;
    }
    this.mdView = this.mdView === "preview" ? "edit" : "preview";
  }

  // ----- conflict resolution (the one blocking prompt) -----

  // Resolve an external-change conflict. Each exit's content source is fixed: reload pulls host→editor;
  // keepLocal adopts the host mtime then re-writes local (cannot re-conflict); diff pulls host for the
  // side-by-side view and stays in conflict for a subsequent reload/keepLocal.
  async resolveConflict(choice: "reload" | "keepLocal" | "diff"): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) {
      return;
    }
    if (choice === "reload") {
      const result = await this.deps.io.readFile(this.root, this.path);
      runInAction(() => {
        this.deps.editor.applyExternalContent(decodeText(result.bytes));
        this.baseline = { modifiedAt: result.modifiedAt };
        this.save = { status: "clean" };
        this.conflict = null;
      });
      return;
    }
    if (choice === "diff") {
      const result = await this.deps.io.readFile(this.root, this.path);
      runInAction(() => {
        this.conflict = {
          hostModifiedAt: conflict.hostModifiedAt,
          comparing: { hostContent: decodeText(result.bytes) },
        };
      });
      return;
    }
    runInAction(() => {
      this.baseline = { modifiedAt: conflict.hostModifiedAt };
      this.conflict = null;
      this.save = { status: "dirty" };
    });
    await this.performSave();
  }

  // ----- find intents (session state via advanceFind; matching is the editor's job) -----

  openFind(): void {
    this.findOpen = true;
    this.find = advanceFind(this.find, { type: "open" });
  }
  openReplace(): void {
    this.findOpen = true;
    this.find = advanceFind(this.find, { type: "openReplace" });
  }
  setFindQuery(query: string): void {
    this.find = advanceFind(this.find, { type: "setQuery", query });
  }
  setMatchCount(current: number, total: number): void {
    this.find = advanceFind(this.find, { type: "setMatchCount", current, total });
  }
  toggleFindOption(option: "matchCase" | "wholeWord" | "regex"): void {
    this.find = advanceFind(this.find, { type: "toggleOption", option });
  }
  closeFind(): void {
    this.findOpen = false;
    this.find = advanceFind(this.find, { type: "close" });
  }

  // ----- save engine (single-flight) -----

  // Write the live buffer once, serially. Snapshot the pending flag at the start (this write covers the
  // current content); on success advance the baseline and, if an edit/blur arrived mid-flight, fire ONE
  // follow-up write with the newest content + newest mtime — so no second write ever races (no false
  // conflict, no lost write).
  private async performSave(): Promise<void> {
    if (!this.baseline) {
      return;
    }
    this.savePending = false;
    runInAction(() => {
      this.save = { status: "saving" };
    });
    const input: WriteFileInput = {
      root: this.root,
      path: this.path,
      content: this.deps.editor.getContent(),
      expectedModifiedAt: this.baseline.modifiedAt,
    };
    let result: WriteFileResult;
    try {
      result = await this.deps.io.writeFile(input);
    } catch {
      runInAction(() => {
        this.save = { status: "failed" };
      });
      return;
    }
    let succeeded = false;
    runInAction(() => {
      succeeded = this.applyWriteResult(result);
    });
    if (succeeded && this.savePending) {
      await this.performSave();
    }
  }

  // Fold a write outcome into the model; returns whether the write succeeded (drives the follow-up).
  private applyWriteResult(result: WriteFileResult): boolean {
    if (result.ok) {
      this.baseline = { modifiedAt: result.modifiedAt };
      this.save = { status: "saved" };
      return true;
    }
    if (result.reason === "conflict") {
      this.conflict = { hostModifiedAt: result.hostModifiedAt, comparing: null };
      this.save = { status: "dirty" };
      return false;
    }
    this.save = { status: "failed" };
    return false;
  }
}

// Decode read bytes to text for the editable/preview surface (shared by load + conflict reload/diff).
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
