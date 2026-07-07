// Tests for the composer bridge ("加入聊天"). The bridge is the single seam onto the old composer
// draft store, so these tests inject a fake draft store and pin Plan-A behavior (chairman ruling): both
// files and directories APPEND the absolute path as a reference line to the current draft text, never
// overwriting existing text or attachments. The structured host-file→attachment path is deferred to a
// composer milestone (needs a new host-file→attachment capability; the readFile→uploadFile download/
// re-upload was rejected), and the bridge interface (addPathToChat) stays stable for that future switch.

import { describe, expect, test, vi } from "vitest";
import { createComposerBridge, type ComposerBridgeDeps } from "./composer-bridge";

// Fake the draft store over an in-memory map keyed by draftKey, recording get/save so a test asserts
// the append (read current → append line → save) without the real zustand store.
function setup(initial: Record<string, { text: string; attachments: unknown[] }> = {}) {
  const drafts = new Map(Object.entries(initial));
  const getDraftInput = vi.fn((key: string) => drafts.get(key));
  const saveDraftInput = vi.fn(
    (input: { draftKey: string; draft: { text: string; attachments: unknown[] } }) => {
      drafts.set(input.draftKey, input.draft);
    },
  );
  const deps: ComposerBridgeDeps = {
    getDraftInput: getDraftInput as ComposerBridgeDeps["getDraftInput"],
    saveDraftInput: saveDraftInput as ComposerBridgeDeps["saveDraftInput"],
  };
  return { bridge: createComposerBridge(deps), drafts, getDraftInput, saveDraftInput };
}

describe("composer-bridge addPathToChat", () => {
  test("a file path is appended as a reference line to an empty draft (attachments untouched)", () => {
    const { bridge, drafts } = setup();

    bridge.addPathToChat({ path: "/host/root/a.ts", kind: "file", draftKey: "d1" });

    expect(drafts.get("d1")).toEqual({ text: "/host/root/a.ts", attachments: [] });
  });

  test("a directory path is appended the same way (file and directory both go to text)", () => {
    const { bridge, drafts } = setup();

    bridge.addPathToChat({ path: "/host/root/src", kind: "directory", draftKey: "d1" });

    expect(drafts.get("d1")).toEqual({ text: "/host/root/src", attachments: [] });
  });

  test("appends to existing draft text on a new line, preserving prior text and attachments", () => {
    const { bridge, drafts } = setup({
      d1: { text: "please look at", attachments: [{ kind: "image" }] },
    });

    bridge.addPathToChat({ path: "/host/root/a.ts", kind: "file", draftKey: "d1" });

    expect(drafts.get("d1")).toEqual({
      text: "please look at\n/host/root/a.ts",
      attachments: [{ kind: "image" }],
    });
  });

  test("does not duplicate the path if it is already the last reference in the draft", () => {
    const { bridge, saveDraftInput } = setup({
      d1: { text: "/host/root/a.ts", attachments: [] },
    });

    bridge.addPathToChat({ path: "/host/root/a.ts", kind: "file", draftKey: "d1" });

    expect(saveDraftInput).not.toHaveBeenCalled();
  });
});
