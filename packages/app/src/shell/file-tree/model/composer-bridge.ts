// Composer bridge ("加入聊天") — the SINGLE seam from the file tree onto the old composer draft store
// (standards §8 4.C / §9 ③: one of only two seams in this directory allowed to touch old feature
// modules). The tree produces "add this path to chat"; this bridge translates it.
//
// This file is the PURE half: the factory + contract, with ZERO old-module imports (only a type import,
// erased at compile time), so the unit test exercises the append logic without loading the heavy draft
// store (whose persist middleware rehydrates AsyncStorage at import — a node-test hazard). The concrete
// wiring onto the real `useDraftStore` lives in composer-bridge.wiring.ts (the registered seam, loaded
// only at runtime by the shell). Together the two files are the one composer seam.
//
// Plan A (chairman ruling, 2026-06-30): BOTH files and directories are added by APPENDING the absolute
// host path as a reference line to the current draft text — never overwriting the user's existing text
// or attachments. Rationale: the tree shows the HOST filesystem and only has the host path (no local
// bytes), so the legacy `{kind:"file"}` attachment path (which uploads local bytes via uploadFile)
// cannot apply; a structured host-file→attachment reference needs a new host-side capability and is
// deferred to a composer milestone (the readFile→uploadFile download/re-upload was explicitly rejected
// as wasteful). For agentic coding, a path reference is in fact more natural than uploaded bytes (the
// agent reads the host file itself). No draftKey / no active draft is already disabled at the menu
// selector, so the bridge isn't reached in that case.
//
// Future switch point: when a structured host-file→attachment capability lands, change only this seam
// (build the structured attachment here) — callers keep calling addPathToChat unchanged.
//
// One caveat to the "zero old-module imports" claim: the DraftInput TYPE below is imported from the
// old draft-store (type-only, erased at compile time — no runtime coupling). Registered as the
// factory's single, deliberate exception in architecture §9.

import type { DraftInput } from "@/stores/draft-store";

// The minimal old draft-store surface the bridge depends on, injected so the append logic is testable
// with a fake and the real store binding stays in composer-bridge.wiring.ts.
export interface ComposerBridgeDeps {
  getDraftInput(draftKey: string): DraftInput | undefined;
  saveDraftInput(input: { draftKey: string; draft: DraftInput }): void;
}

// The bridge's public surface (unchanged across the Plan-A decision). The store/menu depend on this
// shape, not on the composer internals.
export interface ComposerBridge {
  // Append `path` as a reference line to the active draft (file and directory alike). draftKey is
  // guaranteed present by the caller (the menu disables this without an active draft).
  addPathToChat(input: { path: string; kind: "file" | "directory"; draftKey: string }): void;
}

// Build the bridge over injected deps. A factory (not a class) since it holds no state.
export function createComposerBridge(deps: ComposerBridgeDeps): ComposerBridge {
  return {
    addPathToChat({ path, draftKey }) {
      const current = deps.getDraftInput(draftKey) ?? { text: "", attachments: [] };
      // Skip if the path is already the trailing reference, so repeated "add to chat" doesn't stack
      // duplicate lines.
      if (lastLine(current.text) === path) {
        return;
      }
      const text = current.text ? `${current.text}\n${path}` : path;
      deps.saveDraftInput({ draftKey, draft: { text, attachments: current.attachments } });
    },
  };
}

// The last newline-delimited segment of the draft text, for the duplicate-trailing-reference check.
function lastLine(text: string): string {
  const index = text.lastIndexOf("\n");
  return index < 0 ? text : text.slice(index + 1);
}
