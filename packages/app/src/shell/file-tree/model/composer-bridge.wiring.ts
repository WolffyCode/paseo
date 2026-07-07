// Composer bridge wiring — the concrete half of the composer seam (standards §8 4.C / §9 ③). It binds
// the pure composer-bridge factory to the real old `useDraftStore`, and is the ONLY file in this
// directory that imports the old composer draft store. It is loaded at runtime by the shell, never by
// the bridge's unit test (which exercises the pure factory in composer-bridge.ts), so the draft store's
// import-time AsyncStorage rehydration never runs in the node test environment.
//
// Future switch point: when the composer is rebuilt into the new shell, change only this wiring (and,
// if attachments become structured, the factory) — callers keep calling composerBridge.addPathToChat.

import { useDraftStore } from "@/stores/draft-store";
import { type ComposerBridge, createComposerBridge } from "./composer-bridge";

// The production composer bridge, bound to the real draft store. Both reads and writes go through
// useDraftStore.getState() so the binding always targets the live store.
export const composerBridge: ComposerBridge = createComposerBridge({
  getDraftInput: (draftKey) => useDraftStore.getState().getDraftInput(draftKey),
  saveDraftInput: (input) => useDraftStore.getState().saveDraftInput(input),
});
