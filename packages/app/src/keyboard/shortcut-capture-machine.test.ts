import { describe, expect, it } from "vitest";
import {
  type CaptureState,
  type ConflictInfo,
  IDLE_CAPTURE_STATE,
  canSaveCapture,
  capturedComboString,
  captureReducer,
} from "@/keyboard/shortcut-capture-machine";

function capturingState(overrides: Partial<CaptureState> = {}): CaptureState {
  return {
    bindingId: "command-center-toggle-cmd-k-mac",
    capturedCombos: [],
    heldModifiers: null,
    conflict: null,
    ...overrides,
  };
}

describe("shortcut capture machine — transitions", () => {
  it("starts capture with an empty, conflict-free state targeting the binding", () => {
    const next = captureReducer(IDLE_CAPTURE_STATE, {
      type: "start",
      bindingId: "command-center-toggle-cmd-k-mac",
    });
    expect(next).toEqual({
      bindingId: "command-center-toggle-cmd-k-mac",
      capturedCombos: [],
      heldModifiers: null,
      conflict: null,
    });
  });

  it("re-starting on another binding clears any prior captured combos", () => {
    const dirty = capturingState({ capturedCombos: ["Cmd+K"], heldModifiers: "Cmd" });
    const next = captureReducer(dirty, {
      type: "start",
      bindingId: "settings-toggle-cmd-comma-mac",
    });
    expect(next.bindingId).toBe("settings-toggle-cmd-comma-mac");
    expect(next.capturedCombos).toEqual([]);
    expect(next.heldModifiers).toBeNull();
  });

  it("echoes held-only modifiers without capturing a combo or enabling save", () => {
    const next = captureReducer(capturingState(), { type: "key", combo: null, held: "Cmd+Shift" });
    expect(next.heldModifiers).toBe("Cmd+Shift");
    expect(next.capturedCombos).toEqual([]);
    expect(canSaveCapture(next)).toBe(false);
  });

  it("appends a captured combo and clears the held-modifier echo", () => {
    const held = capturingState({ heldModifiers: "Cmd+Shift" });
    const next = captureReducer(held, { type: "key", combo: "Cmd+Shift+K", held: null });
    expect(next.capturedCombos).toEqual(["Cmd+Shift+K"]);
    expect(next.heldModifiers).toBeNull();
    expect(canSaveCapture(next)).toBe(true);
  });

  it("appends successive combos to build a multi-segment chord", () => {
    const first = captureReducer(capturingState(), { type: "key", combo: "Cmd+K", held: null });
    const second = captureReducer(first, { type: "key", combo: "S", held: null });
    expect(second.capturedCombos).toEqual(["Cmd+K", "S"]);
    expect(capturedComboString(second)).toBe("Cmd+K S");
  });

  it("backspace removes the last captured segment", () => {
    const chord = capturingState({ capturedCombos: ["Cmd+K", "S"] });
    const next = captureReducer(chord, { type: "backspace" });
    expect(next.capturedCombos).toEqual(["Cmd+K"]);
  });

  it("backspace on an empty capture is a no-op and does not crash", () => {
    const empty = capturingState({ capturedCombos: [] });
    const next = captureReducer(empty, { type: "backspace" });
    expect(next.capturedCombos).toEqual([]);
    expect(next.bindingId).toBe(empty.bindingId);
  });

  it("cancel returns to the idle empty state", () => {
    const chord = capturingState({ capturedCombos: ["Cmd+K"], heldModifiers: "Cmd" });
    expect(captureReducer(chord, { type: "cancel" })).toEqual(IDLE_CAPTURE_STATE);
  });

  it("blur (lost focus / tab switch) returns to the idle empty state", () => {
    const chord = capturingState({ capturedCombos: ["Cmd+K"] });
    expect(captureReducer(chord, { type: "blur" })).toEqual(IDLE_CAPTURE_STATE);
  });

  it("save returns to the idle empty state (persistence is the caller's effect)", () => {
    const chord = capturingState({ capturedCombos: ["Cmd+Shift+K"] });
    expect(captureReducer(chord, { type: "save" })).toEqual(IDLE_CAPTURE_STATE);
  });

  it("ignores key / backspace / save events when not capturing", () => {
    expect(captureReducer(IDLE_CAPTURE_STATE, { type: "key", combo: "Cmd+K", held: null })).toEqual(
      IDLE_CAPTURE_STATE,
    );
    expect(captureReducer(IDLE_CAPTURE_STATE, { type: "backspace" })).toEqual(IDLE_CAPTURE_STATE);
    expect(captureReducer(IDLE_CAPTURE_STATE, { type: "save" })).toEqual(IDLE_CAPTURE_STATE);
  });
});

describe("shortcut capture machine — save predicate", () => {
  it("cannot save an empty capture", () => {
    expect(canSaveCapture(capturingState({ capturedCombos: [] }))).toBe(false);
  });

  it("can save once at least one combo is captured", () => {
    expect(canSaveCapture(capturingState({ capturedCombos: ["Cmd+K"] }))).toBe(true);
  });

  it("cannot save while a conflict is present (conflict-detection seam)", () => {
    const conflict: ConflictInfo = { bindingId: "workspace-file-open-cmd-p-mac", combo: "Cmd+P" };
    expect(canSaveCapture(capturingState({ capturedCombos: ["Cmd+P"], conflict }))).toBe(false);
  });

  it("joins captured combos with a space for persistence", () => {
    expect(capturedComboString(capturingState({ capturedCombos: ["Cmd+K", "S"] }))).toBe("Cmd+K S");
    expect(capturedComboString(capturingState({ capturedCombos: [] }))).toBe("");
  });
});

describe("shortcut capture machine — conflict seam stays inert", () => {
  it("never populates conflict through any capture transition this phase", () => {
    const start = captureReducer(IDLE_CAPTURE_STATE, {
      type: "start",
      bindingId: "workspace-file-open-cmd-p-mac",
    });
    const held = captureReducer(start, { type: "key", combo: null, held: "Cmd" });
    const captured = captureReducer(held, { type: "key", combo: "Cmd+P", held: null });
    const afterBackspace = captureReducer(captured, { type: "backspace" });
    for (const state of [start, held, captured, afterBackspace]) {
      expect(state.conflict).toBeNull();
    }
  });
});
