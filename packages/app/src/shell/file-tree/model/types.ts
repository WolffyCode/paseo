// Self-owned type surface for the file-tree shell (standards §8 clean-room rewrite).
// Aligns with @getpaseo/client list-directory response items but deliberately does
// NOT import the legacy `ExplorerEntry`, so the new directory carries zero old deps.

/** One listed filesystem entry; shape mirrors the client list-directory payload item. */
export interface TreeEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly size: number;
  readonly modifiedAt: string;
}

/** Flat render projection of a tree node, with depth + per-row state for the view to paint. */
export interface TreeNodeView {
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly depth: number;
  readonly isExpanded: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isSelected: boolean;
  readonly isDraft: boolean;
}

/** Front-end-only clipboard state; cut moves on paste, copy duplicates. Never persisted. */
export interface Clipboard {
  readonly mode: "cut" | "copy";
  readonly path: string;
}

/** Inline new/rename editing state; null = no inline editor open. Drives the placeholder row. */
export type Editing =
  | {
      readonly kind: "new-file" | "new-folder";
      readonly parentPath: string;
      readonly draftName: string;
      readonly error: InlineNameError | null;
    }
  | {
      readonly kind: "rename";
      readonly targetPath: string;
      readonly originalName: string;
      readonly draftName: string;
      readonly error: InlineNameError | null;
    }
  | null;

/** Why an inline name was rejected; drives the row-level error label. */
export type InlineNameError = "empty" | "duplicate" | "invalid-chars" | "reserved";

/** One search hit; mirrors the fs.search response item (content hits add line/preview/ranges). */
export interface SearchMatch {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly line?: number;
  readonly preview?: string;
  readonly ranges?: ReadonlyArray<{ start: number; end: number }>;
}

/** One row of a context menu; disabled items still render (greyed) per sFT8 conditional-disable. */
export interface ContextMenuItem {
  readonly id:
    | "new-file"
    | "new-folder"
    | "paste"
    | "cut"
    | "copy"
    | "rename"
    | "add-to-chat"
    | "find-in-files"
    | "reveal-in-finder"
    | "copy-path"
    | "copy-relative-path"
    | "delete";
  readonly label: string;
  readonly enabled: boolean;
  readonly destructive?: boolean;
}

/** Why a search landed in the error phase: the host lacks the capability vs. a run-time failure. */
export type SearchErrorKind = "unsupported" | "failed";

/** Aggregate search state advanced by the search-state machine. */
export interface SearchState {
  readonly mode: "name" | "content";
  readonly query: string;
  readonly results: ReadonlyArray<SearchMatch>;
  readonly phase: "idle" | "searching" | "results" | "empty" | "error";
  /** Present only in the error phase — picks the "upgrade host" vs "search failed" copy. */
  readonly errorKind?: SearchErrorKind;
}
