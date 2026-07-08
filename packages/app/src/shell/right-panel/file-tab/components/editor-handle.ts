import type { EditorHandle } from "../model/file-document-model";

// A live editor buffer the CodeMirror surface exposes to the handle once it mounts: read the current
// text, replace the whole doc. The surface implements this over its EditorView; the model never sees it
// directly — only through the connectable handle.
export interface EditorBackend {
  getContent(): string;
  applyExternalContent(text: string): void;
}

// The connectable handle the factory injects into FileDocumentModel: it satisfies EditorHandle at all
// times, so model.load() (which seeds via applyExternalContent) is safe whether it runs before or after
// the CodeMirror view mounts.
export interface ConnectableEditorHandle extends EditorHandle {
  connect(backend: EditorBackend): void;
  disconnect(): void;
}

// Build a handle that buffers a pending seed until the view connects, then routes through the view. This
// closes the seam between "model built first" and "view mounts later": a pre-connect applyExternalContent
// (from load()) is remembered and replayed into the view on connect; getContent answers from the buffer
// until then. disconnect snapshots the view's content back into the buffer so a getContent after unmount
// (e.g. a trailing autosave) still returns the last-known text.
export function createConnectableEditorHandle(): ConnectableEditorHandle {
  let backend: EditorBackend | null = null;
  let buffer = "";
  let pendingSeed = false;

  return {
    getContent(): string {
      return backend ? backend.getContent() : buffer;
    },
    applyExternalContent(text: string): void {
      if (backend) {
        backend.applyExternalContent(text);
        return;
      }
      buffer = text;
      pendingSeed = true;
    },
    connect(next: EditorBackend): void {
      backend = next;
      // Replay a seed that arrived before the view existed; skip when none, so we never clobber the
      // view's own initial content with an empty buffer.
      if (pendingSeed) {
        next.applyExternalContent(buffer);
        pendingSeed = false;
      }
    },
    disconnect(): void {
      if (backend) {
        buffer = backend.getContent();
        backend = null;
      }
    },
  };
}
