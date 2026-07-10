import type { EditorHandle } from "../model/file-document-model";

// A live CodeMirror backend exposed once the surface mounts: read/replace content and reveal a 1-based
// line. The model only sees the stable connectable handle, never this mount-bound view.
export interface EditorBackend {
  getContent(): string;
  applyExternalContent(text: string): void;
  revealLine(line: number): void;
}

// The connectable handle the factory injects into FileDocumentModel: it satisfies EditorHandle at all
// times, so model.load() (which seeds via applyExternalContent) is safe whether it runs before or after
// the CodeMirror view mounts.
export interface ConnectableEditorHandle extends EditorHandle {
  connect(backend: EditorBackend): void;
  disconnect(): void;
}

// Build a handle that buffers content and the latest one-shot reveal until the view connects. Connect
// always seeds content first, then reveals; disconnect re-arms only the content snapshot for a fresh view,
// never a reveal that was already consumed, so switching back to a tab does not jump again.
export function createConnectableEditorHandle(): ConnectableEditorHandle {
  let backend: EditorBackend | null = null;
  let buffer = "";
  let pendingSeed = false;
  let pendingRevealLine: number | null = null;

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
    revealLine(line: number): void {
      if (backend) {
        backend.revealLine(line);
        return;
      }
      pendingRevealLine = line;
    },
    connect(next: EditorBackend): void {
      backend = next;
      // Replay a seed that arrived before the view existed; skip when none, so we never clobber the
      // view's own initial content with an empty buffer.
      if (pendingSeed) {
        next.applyExternalContent(buffer);
        pendingSeed = false;
      }
      if (pendingRevealLine !== null) {
        next.revealLine(pendingRevealLine);
        pendingRevealLine = null;
      }
    },
    disconnect(): void {
      if (backend) {
        buffer = backend.getContent();
        backend = null;
        // Arm a re-seed: the next connect is a fresh/empty view (tab switched back), so the snapshot must
        // replay or the editor comes back blank (defect B). getContent answers from the buffer meanwhile.
        pendingSeed = true;
      }
    },
  };
}
