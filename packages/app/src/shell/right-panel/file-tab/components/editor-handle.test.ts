import { describe, expect, it, vi } from "vitest";
import { createConnectableEditorHandle, type EditorBackend } from "./editor-handle";

// The connectable EditorHandle bridges the gap between "the FileDocumentModel is built (and may call
// load() → applyExternalContent) BEFORE the CodeMirror view mounts" and "getContent/applyExternalContent
// must route to the live view once it exists". Before connect it buffers a pending seed and answers
// getContent from that buffer; connect seeds the pending text into the view and thereafter everything
// routes to the view. This makes model.load() safe to call at any time relative to the surface mount.

function fakeBackend(initial = ""): EditorBackend & { text: string } {
  const backend = {
    text: initial,
    getContent: vi.fn((): string => backend.text),
    applyExternalContent: vi.fn((text: string): void => {
      backend.text = text;
    }),
  };
  return backend;
}

describe("createConnectableEditorHandle", () => {
  it("returns empty content before any seed and before connect", () => {
    const handle = createConnectableEditorHandle();
    expect(handle.getContent()).toBe("");
  });

  it("buffers a pre-connect seed and answers getContent from it", () => {
    const handle = createConnectableEditorHandle();
    handle.applyExternalContent("seeded text");
    expect(handle.getContent()).toBe("seeded text");
  });

  it("seeds the pending pre-connect text into the backend on connect", () => {
    const handle = createConnectableEditorHandle();
    handle.applyExternalContent("loaded before mount");
    const backend = fakeBackend();

    handle.connect(backend);

    expect(backend.applyExternalContent).toHaveBeenCalledExactlyOnceWith("loaded before mount");
    expect(handle.getContent()).toBe("loaded before mount");
  });

  it("routes getContent and applyExternalContent to the backend after connect", () => {
    const handle = createConnectableEditorHandle();
    const backend = fakeBackend("live buffer");
    handle.connect(backend);

    expect(handle.getContent()).toBe("live buffer");

    handle.applyExternalContent("reloaded from host");
    expect(backend.applyExternalContent).toHaveBeenCalledWith("reloaded from host");
    expect(handle.getContent()).toBe("reloaded from host");
  });

  it("does not clobber the backend when connecting without a pending seed", () => {
    const handle = createConnectableEditorHandle();
    const backend = fakeBackend("existing view content");
    handle.connect(backend);

    expect(backend.applyExternalContent).not.toHaveBeenCalled();
    expect(handle.getContent()).toBe("existing view content");
  });

  it("snapshots content on disconnect so getContent still answers after the view is gone", () => {
    const handle = createConnectableEditorHandle();
    const backend = fakeBackend();
    handle.connect(backend);
    handle.applyExternalContent("edited then unmounted");

    handle.disconnect();

    expect(handle.getContent()).toBe("edited then unmounted");
  });

  // Switching a tab away unmounts the view (disconnect) and switching back remounts a FRESH view (connect).
  // A remounted CodeMirror view starts empty, so the snapshot must be re-seeded on reconnect — otherwise
  // the editor comes back blank and the user's content is lost (defect B).
  it("re-seeds a fresh backend on reconnect after a disconnect", () => {
    const handle = createConnectableEditorHandle();
    const first = fakeBackend();
    handle.connect(first);
    handle.applyExternalContent("edited content"); // routes to the live view

    handle.disconnect(); // tab switched away: snapshot + arm the re-seed
    const second = fakeBackend(); // tab switched back: a fresh, empty view
    handle.connect(second);

    expect(second.applyExternalContent).toHaveBeenCalledExactlyOnceWith("edited content");
    expect(handle.getContent()).toBe("edited content");
  });
});
