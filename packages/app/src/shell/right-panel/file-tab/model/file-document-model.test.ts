import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";
import { describe, expect, it, vi } from "vitest";
import {
  type FileTabIo,
  FileDocumentModel,
  type WriteFileInput,
  type WriteFileResult,
} from "./file-document-model";

// FileDocumentModel is the file-tab domain object (MobX class, implements TabContent). Driven with a
// fake FileTabIo + fake editor handle + fake revealFile (no rendering), the tests pin: load/classify,
// initial/retarget line reveal consumption, edit→dirty, blur/close autosave with baseline-mtime advance,
// non-blocking write failure, the M6 concurrency guard (single-flight serial re-save), conflict three-
// exits, md preview⇄edit, image/binary read-only, and the TabContent surface.

const T0 = "2026-07-08T00:00:00.000Z";

// Build a FileReadResult for the fake host read. Bytes carry the text content; kind/modifiedAt drive
// classification + the baseline.
function read(
  content: string,
  modifiedAt = T0,
  kind: FileReadResult["kind"] = "text",
  path = "src/a.ts",
): FileReadResult {
  return {
    bytes: new TextEncoder().encode(content),
    mime: "text/plain",
    size: content.length,
    path,
    kind,
    modifiedAt,
  };
}

// Flush pending microtasks/timers so an async save/read settles before assertions.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A recording editor buffer stand-in. getContent returns the live buffer (a test mutates `content` to
// simulate typing); applyExternalContent records host-content pushes (reload / initial seed).
class FakeEditor {
  content = "";
  applied: string[] = [];
  revealedLines: number[] = [];
  events: string[] = [];
  getContent = (): string => this.content;
  applyExternalContent = (text: string): void => {
    this.content = text;
    this.applied.push(text);
    this.events.push("seed");
  };
  revealLine = (line: number): void => {
    this.revealedLines.push(line);
    this.events.push(`reveal:${line}`);
  };
}

// A controllable FileTabIo. writeFile records every input; in manual mode a write stays pending until
// the test settles it (for the concurrency guard), otherwise it resolves with the next queued result.
class FakeIo implements FileTabIo {
  readResult: FileReadResult;
  writeCalls: WriteFileInput[] = [];
  manual = false;
  private queued: WriteFileResult[] = [];
  private resolvers: Array<(result: WriteFileResult) => void> = [];

  constructor(readResult: FileReadResult) {
    this.readResult = readResult;
  }

  readFile = async (): Promise<FileReadResult> => this.readResult;

  writeFile = (input: WriteFileInput): Promise<WriteFileResult> => {
    this.writeCalls.push(input);
    if (this.manual) {
      return new Promise((resolve) => this.resolvers.push(resolve));
    }
    return Promise.resolve(
      this.queued.shift() ?? { ok: true, modifiedAt: `mt-${this.writeCalls.length}` },
    );
  };

  queueWrite(...results: WriteFileResult[]): void {
    this.queued.push(...results);
  }

  settle(index: number, result: WriteFileResult): void {
    this.resolvers[index](result);
  }
}

function setup(
  opts: { read?: FileReadResult; writeCapable?: boolean; path?: string; lineStart?: number } = {},
) {
  const readResult = opts.read ?? read("hello");
  const io = new FakeIo(readResult);
  const editor = new FakeEditor();
  const revealFile = vi.fn();
  const model = new FileDocumentModel(
    {
      root: "~/proj",
      location: {
        path: opts.path ?? "src/a.ts",
        ...(opts.lineStart !== undefined ? { lineStart: opts.lineStart } : {}),
      },
      writeCapable: opts.writeCapable ?? true,
    },
    { io, editor, revealFile },
  );
  return { model, io, editor, revealFile };
}

describe("FileDocumentModel · load", () => {
  // Load reads the host file, classifies the kind, seeds the editable buffer, and records the baseline
  // mtime (only the mtime — the model never mirrors the content).
  it("classifies, seeds the editor, and records the baseline", async () => {
    const { model, editor } = setup({ read: read("hello world", T0) });
    await model.load();
    expect(model.loadState).toBe("loaded");
    expect(model.kind).toBe("code");
    expect(model.baseline).toEqual({ modifiedAt: T0 });
    expect(editor.content).toBe("hello world");
    expect(editor.revealedLines).toEqual([]);
    expect(model.save).toEqual({ status: "clean" });
  });

  // An initial search-hit line belongs to the model until text content has been seeded. Load then hands
  // it to the editor exactly once and clears the model target, preserving seed-before-selection order.
  it("consumes an initial line reveal after seeding editable content", async () => {
    const { model, editor } = setup({ read: read("hello world", T0), lineStart: 60 });
    expect(model.pendingRevealLine).toBe(60);
    expect(editor.revealedLines).toEqual([]);

    await model.load();

    expect(editor.events).toEqual(["seed", "reveal:60"]);
    expect(model.pendingRevealLine).toBeNull();
  });
});

describe("FileDocumentModel · line retarget", () => {
  // Re-opening an already-loaded file at a new line reuses the same document and issues a fresh one-shot
  // reveal immediately; the target never remains to fire again on a later tab activation.
  it("reveals a new line on an existing document and clears the target", async () => {
    const { model, editor } = setup();
    await model.load();
    editor.events.length = 0;

    model.retarget({ path: "src/a.ts", lineStart: 42 });

    expect(editor.events).toEqual(["reveal:42"]);
    expect(model.pendingRevealLine).toBeNull();
  });
});

describe("FileDocumentModel · edit", () => {
  // An edit marks the document dirty, surfacing the dirty activity dot on the tab.
  it("marks dirty and shows the dirty dot", async () => {
    const { model } = setup();
    await model.load();
    model.markEdited();
    expect(model.save).toEqual({ status: "dirty" });
    expect(model.activityDot).toBe("dirty");
  });
});

describe("FileDocumentModel · autosave on blur", () => {
  // Blur writes the live buffer with the baseline mtime as the conflict guard; success clears dirty and
  // advances the baseline to the returned mtime.
  it("writes on blur, then clears dirty and advances the baseline", async () => {
    const { model, io, editor } = setup({ read: read("hello", T0) });
    await model.load();
    editor.content = "hello!";
    model.markEdited();
    io.queueWrite({ ok: true, modifiedAt: "t1" });
    model.autosaveOnBlur();
    await tick();
    expect(io.writeCalls).toEqual([
      { root: "~/proj", path: "src/a.ts", content: "hello!", expectedModifiedAt: T0 },
    ]);
    expect(model.save).toEqual({ status: "saved" });
    expect(model.baseline).toEqual({ modifiedAt: "t1" });
    expect(model.activityDot).toBe("none");
  });

  // A denied/unavailable write is a NON-BLOCKING failure: the changes are preserved (editor untouched),
  // no dialog, ready to retry on the next blur.
  it("keeps changes and reports a non-blocking failure on denial", async () => {
    const { model, io, editor } = setup();
    await model.load();
    editor.content = "edited";
    model.markEdited();
    io.queueWrite({ ok: false, reason: "denied" });
    model.autosaveOnBlur();
    await tick();
    expect(model.save).toEqual({ status: "failed" });
    expect(editor.content).toBe("edited");
  });
});

describe("FileDocumentModel · concurrency guard (M6)", () => {
  // While a save is in flight, another blur must NOT start a second concurrent write. After the first
  // write settles, if the buffer changed meanwhile, exactly ONE follow-up write goes out — with the
  // latest content AND the new baseline mtime, so there is no false conflict and no lost write.
  it("serializes saves into a single-flight follow-up write", async () => {
    const { model, io, editor } = setup({ read: read("v0", T0) });
    await model.load();
    io.manual = true;

    editor.content = "v1";
    model.markEdited();
    model.autosaveOnBlur(); // write #1 in flight (v1, expected T0)
    await tick();
    expect(io.writeCalls).toHaveLength(1);

    editor.content = "v2";
    model.markEdited(); // changed mid-flight
    model.autosaveOnBlur(); // must not start a 2nd concurrent write
    await tick();
    expect(io.writeCalls).toHaveLength(1);

    io.settle(0, { ok: true, modifiedAt: "t1" });
    await tick();
    // follow-up fired with the latest content and the advanced baseline mtime
    expect(io.writeCalls).toHaveLength(2);
    expect(io.writeCalls[1]).toEqual({
      root: "~/proj",
      path: "src/a.ts",
      content: "v2",
      expectedModifiedAt: "t1",
    });

    io.settle(1, { ok: true, modifiedAt: "t2" });
    await tick();
    expect(model.save).toEqual({ status: "saved" });
    expect(model.baseline).toEqual({ modifiedAt: "t2" });
  });
});

describe("FileDocumentModel · close", () => {
  // Closing (onClosing) blurs first = autosave, so an unsaved edit is written before the tab goes away.
  it("autosaves via onClosing", async () => {
    const { model, io, editor } = setup();
    await model.load();
    editor.content = "changed";
    model.markEdited();
    io.queueWrite({ ok: true, modifiedAt: "t1" });
    model.onClosing();
    await tick();
    expect(io.writeCalls).toHaveLength(1);
    expect(io.writeCalls[0].content).toBe("changed");
  });
});

describe("FileDocumentModel · external conflict", () => {
  // Reach a conflict: an edit's blur-write comes back conflict{hostModifiedAt} because the host mtime moved.
  async function toConflict() {
    const ctx = setup({ read: read("base", T0) });
    await ctx.model.load();
    ctx.editor.content = "local-edit";
    ctx.model.markEdited();
    ctx.io.queueWrite({ ok: false, reason: "conflict", hostModifiedAt: "host9" });
    ctx.model.autosaveOnBlur();
    await tick();
    return ctx;
  }

  it("enters the conflict state on a host-mtime conflict", async () => {
    const { model } = await toConflict();
    expect(model.conflict).toEqual({ hostModifiedAt: "host9", comparing: null });
  });

  // Reload pulls the host's latest into the editor, resets the baseline to the host mtime, and clears
  // the dirty/conflict state — a determinate exit.
  it("reload loads the host content and resets to a clean baseline", async () => {
    const { model, io, editor } = await toConflict();
    io.readResult = read("host-latest", "host9");
    await model.resolveConflict("reload");
    expect(editor.content).toBe("host-latest");
    expect(model.baseline).toEqual({ modifiedAt: "host9" });
    expect(model.save).toEqual({ status: "clean" });
    expect(model.conflict).toBeNull();
  });

  // Keep-local overwrites the host: it adopts the host mtime as the baseline then re-writes the local
  // content, so this second write cannot re-conflict.
  it("keepLocal overwrites the host using the host mtime", async () => {
    const { model, io } = await toConflict();
    io.queueWrite({ ok: true, modifiedAt: "host10" });
    await model.resolveConflict("keepLocal");
    await tick();
    const last = io.writeCalls[io.writeCalls.length - 1];
    expect(last.content).toBe("local-edit");
    expect(last.expectedModifiedAt).toBe("host9");
    expect(model.conflict).toBeNull();
    expect(model.save).toEqual({ status: "saved" });
    expect(model.baseline).toEqual({ modifiedAt: "host10" });
  });

  // Diff pulls the host's latest for side-by-side comparison and stays in conflict (the user still
  // chooses reload/keepLocal after looking).
  it("diff pulls host content for comparison and stays in conflict", async () => {
    const { model, io } = await toConflict();
    io.readResult = read("host-latest", "host9");
    await model.resolveConflict("diff");
    expect(model.conflict).toEqual({
      hostModifiedAt: "host9",
      comparing: { hostContent: "host-latest" },
    });
  });
});

describe("FileDocumentModel · markdown view", () => {
  // Markdown defaults to preview and toggles to edit and back without losing unsaved changes (the
  // editor buffer is untouched by the toggle).
  it("toggles preview/edit without losing changes", async () => {
    const { model, editor } = setup({
      path: "README.md",
      lineStart: 12,
      read: read("# hi", T0, "text", "README.md"),
    });
    await model.load();
    expect(model.kind).toBe("markdown");
    expect(model.mdView).toBe("preview");
    expect(editor.revealedLines).toEqual([]);
    expect(model.pendingRevealLine).toBeNull();
    editor.content = "# hi edited";
    model.markEdited();
    model.toggleMdView();
    expect(model.mdView).toBe("edit");
    expect(model.save).toEqual({ status: "dirty" });
    expect(editor.content).toBe("# hi edited");
    model.toggleMdView();
    expect(model.mdView).toBe("preview");
  });
});

describe("FileDocumentModel · read-only", () => {
  // An image is read-only: no editor seed, no dirty, edits are ignored.
  it("treats an image as read-only with no dirty state", async () => {
    const { model, editor } = setup({
      path: "logo.png",
      lineStart: 12,
      read: read("", T0, "image", "logo.png"),
    });
    await model.load();
    expect(model.kind).toBe("image");
    expect(model.readOnlyReason).toBe("image");
    expect(editor.applied).toHaveLength(0);
    expect(editor.revealedLines).toEqual([]);
    expect(model.pendingRevealLine).toBeNull();
    model.markEdited();
    expect(model.save).toEqual({ status: "clean" });
    expect(model.activityDot).toBe("none");
  });

  // An image also decodes to a data URI so the read-only preview can render it (no editor buffer exists).
  it("exposes the image as a data URI", async () => {
    const bytes = new TextEncoder().encode("PNGDATA");
    const { model } = setup({
      read: {
        bytes,
        mime: "image/png",
        size: bytes.length,
        path: "logo.png",
        kind: "image",
        modifiedAt: T0,
      },
      path: "logo.png",
    });
    await model.load();
    expect(model.imageDataUri).toBe("data:image/png;base64,UE5HREFUQQ==");
  });

  // A binary is read-only too (unrecognized fallback).
  it("treats a binary as read-only", async () => {
    const { model } = setup({ path: "app.wasm", read: read("", T0, "binary", "app.wasm") });
    await model.load();
    expect(model.readOnlyReason).toBe("binary");
  });

  // Without host write capability the tab is read-only (capability gate) even for editable content.
  it("is read-only when the host lacks write capability", async () => {
    const { model } = setup({ writeCapable: false });
    await model.load();
    expect(model.readOnlyReason).toBe("capability");
    model.markEdited();
    expect(model.save).toEqual({ status: "clean" });
  });
});

describe("FileDocumentModel · empty 'choose a file' tab (defect 1)", () => {
  // An empty-path tab is the launcher's "choose a file" state. Load must be a guarded no-op — readFile("")
  // would resolve to the root dir and error. It lands "loaded" with no editor seed; the view shows the
  // empty state off !doc.path.
  it("does not read an empty path and seeds nothing", async () => {
    const io = new FakeIo(read("should-not-be-read"));
    const readSpy = vi.spyOn(io, "readFile");
    const editor = new FakeEditor();
    const model = new FileDocumentModel(
      { root: "/proj", location: { path: "" }, writeCapable: true },
      { io, editor, revealFile: vi.fn() },
    );

    await model.load();

    expect(readSpy).not.toHaveBeenCalled();
    expect(model.loadState).toBe("loaded");
    expect(editor.applied).toHaveLength(0);
  });

  // Activating the empty launcher placeholder must not issue a tree reveal: it names no file, and sending
  // the empty path would make the tree treat it as an out-of-bounds target and destroy its current root.
  it("does not reveal an empty path when activated", () => {
    const { model, revealFile } = setup({ path: "" });

    model.onActivated();

    expect(revealFile).not.toHaveBeenCalled();
  });
});

describe("FileDocumentModel · absolute identity path (defect 7)", () => {
  // The location path is the ABSOLUTE host path (the tab-identity axis, stable across tree roots). The
  // model derives the root-relative path for IO from it, yet reveals with the absolute path — so identity
  // dedups across roots while readFile/writeFile still speak the tree's root-relative space.
  it("derives the root-relative path for writes and reveals with the absolute path", async () => {
    const io = new FakeIo(read("hello", T0));
    const editor = new FakeEditor();
    const revealFile = vi.fn();
    const model = new FileDocumentModel(
      { root: "/proj", location: { path: "/proj/src/a.ts" }, writeCapable: true },
      { io, editor, revealFile },
    );
    await model.load();
    editor.content = "hello!";
    model.markEdited();
    model.autosaveOnBlur();
    await tick();

    expect(io.writeCalls[0]).toMatchObject({ root: "/proj", path: "src/a.ts" });
    model.onActivated();
    expect(revealFile).toHaveBeenCalledWith("/proj/src/a.ts");
    expect(model.title).toBe("a.ts");
  });
});

describe("FileDocumentModel · TabContent surface", () => {
  // The tab title is the file name (last path segment).
  it("titles the tab with the file name", () => {
    const { model } = setup({ path: "src/deep/file.ts" });
    expect(model.title).toBe("file.ts");
  });

  // Activating the tab reveals the file in the tree (the three-branch decision belongs to file-tree).
  it("reveals the file on activation", () => {
    const { model, revealFile } = setup({ path: "src/a.ts" });
    model.onActivated();
    expect(revealFile).toHaveBeenCalledWith("src/a.ts");
  });
});

describe("FileDocumentModel · find intents", () => {
  // The find intents drive the find session (via the find state machine) + widget visibility.
  it("opens/updates/closes the find session", async () => {
    const { model } = setup();
    await model.load();
    model.openFind();
    expect(model.findOpen).toBe(true);
    model.setFindQuery("todo");
    expect(model.find.query).toBe("todo");
    model.toggleFindOption("regex");
    expect(model.find.regex).toBe(true);
    model.setMatchCount(1, 4);
    expect(model.find).toMatchObject({ current: 1, total: 4 });
    model.openReplace();
    expect(model.find.replaceExpanded).toBe(true);
    model.closeFind();
    expect(model.findOpen).toBe(false);
    expect(model.find.query).toBe("");
  });
});
