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

  // Same-kind tabs reuse the same renderer shape, but keyed mounts give each document a fresh backend.
  // Switching A -> B -> A must preserve each handle's own edits and never seed one document into the other.
  it("keeps same-kind documents isolated across A to B to A remounts", () => {
    const handleA = createConnectableEditorHandle();
    const handleB = createConnectableEditorHandle();
    handleA.applyExternalContent("A loaded");
    handleB.applyExternalContent("B loaded");

    const firstA = fakeBackend();
    handleA.connect(firstA);
    expect(firstA.applyExternalContent).toHaveBeenCalledExactlyOnceWith("A loaded");
    firstA.text = "A edited";
    handleA.disconnect();
    expect(handleA.getContent()).toBe("A edited");

    const firstB = fakeBackend();
    handleB.connect(firstB);
    expect(firstB.applyExternalContent).toHaveBeenCalledExactlyOnceWith("B loaded");
    firstB.text = "B edited";
    handleB.disconnect();
    expect(handleB.getContent()).toBe("B edited");

    const secondA = fakeBackend();
    handleA.connect(secondA);
    expect(secondA.applyExternalContent).toHaveBeenCalledExactlyOnceWith("A edited");
    expect(handleA.getContent()).toBe("A edited");
    handleA.disconnect();

    const secondB = fakeBackend();
    handleB.connect(secondB);
    expect(secondB.applyExternalContent).toHaveBeenCalledExactlyOnceWith("B edited");
    expect(handleB.getContent()).toBe("B edited");
  });
});
