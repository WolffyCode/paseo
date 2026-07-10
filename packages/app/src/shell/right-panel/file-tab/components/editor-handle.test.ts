import { describe, expect, it, vi } from "vitest";
import { createConnectableEditorHandle, type EditorBackend } from "./editor-handle";

// The connectable EditorHandle bridges the gap between "the FileDocumentModel is built (and may seed or
// request a line reveal) BEFORE the CodeMirror view mounts" and "buffer commands must reach the live view
// once it exists". Connect replays content before the latest one-shot reveal; disconnect preserves content
// for remount without re-arming an already-consumed reveal.

function fakeBackend(initial = ""): EditorBackend & { text: string; events: string[] } {
  const backend = {
    text: initial,
    events: [] as string[],
    getContent: vi.fn((): string => backend.text),
    applyExternalContent: vi.fn((text: string): void => {
      backend.text = text;
      backend.events.push("seed");
    }),
    revealLine: vi.fn((line: number): void => {
      backend.events.push(`reveal:${line}`);
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

  it("replays the latest buffered line after the content seed exactly once", () => {
    const handle = createConnectableEditorHandle();
    handle.applyExternalContent("line 1\nline 2");
    handle.revealLine(41);
    handle.revealLine(60);
    const firstBackend = fakeBackend();

    handle.connect(firstBackend);

    expect(firstBackend.revealLine).toHaveBeenCalledExactlyOnceWith(60);
    expect(firstBackend.events).toEqual(["seed", "reveal:60"]);

    handle.disconnect();
    const secondBackend = fakeBackend();
    handle.connect(secondBackend);

    expect(secondBackend.applyExternalContent).toHaveBeenCalledExactlyOnceWith("line 1\nline 2");
    expect(secondBackend.revealLine).not.toHaveBeenCalled();
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

  it("routes a line reveal directly to the connected backend", () => {
    const handle = createConnectableEditorHandle();
    const backend = fakeBackend("live buffer");
    handle.connect(backend);

    handle.revealLine(27);

    expect(backend.revealLine).toHaveBeenCalledExactlyOnceWith(27);
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
