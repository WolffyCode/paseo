/**
 * Pure state machine for the "rebind a keyboard shortcut" capture flow. Lives
 * apart from the React section so every transition is testable without
 * rendering: the component only translates DOM key events into events and reads
 * derived selectors. Persistence (writing the override) is the caller's effect;
 * the reducer just tracks the transient capture and resets afterwards.
 *
 * The `conflict` field is the conflict-detection seam (deferred): it is never
 * populated this phase, but `canSaveCapture` already gates on it so adding a
 * `detectConflict` producer later needs no reducer or component contract change.
 */

/** A captured combo that already belongs to another binding (deferred seam). */
export interface ConflictInfo {
  bindingId: string;
  combo: string;
}

export interface CaptureState {
  /** Binding being rebound; null = not capturing. */
  bindingId: string | null;
  /** Captured chord segments (each a combo string); joined with spaces to persist. */
  capturedCombos: string[];
  /** Live echo of modifiers held with no non-modifier key yet; null otherwise. */
  heldModifiers: string | null;
  /** Conflict seam — always null this phase (see module header). */
  conflict: ConflictInfo | null;
}

export type CaptureEvent =
  | { type: "start"; bindingId: string }
  | { type: "key"; combo: string | null; held: string | null }
  | { type: "backspace" }
  | { type: "cancel" }
  | { type: "save" }
  | { type: "blur" };

export const IDLE_CAPTURE_STATE: CaptureState = {
  bindingId: null,
  capturedCombos: [],
  heldModifiers: null,
  conflict: null,
};

/** Reduce a capture event to the next transient capture state (pure). */
export function captureReducer(state: CaptureState, event: CaptureEvent): CaptureState {
  switch (event.type) {
    case "start":
      return {
        bindingId: event.bindingId,
        capturedCombos: [],
        heldModifiers: null,
        conflict: null,
      };
    case "cancel":
    case "blur":
    case "save":
      // Exiting the capture is identical for all three; the caller persists the
      // override on "save" before dispatching, reading capturedComboString.
      return IDLE_CAPTURE_STATE;
    case "key":
      if (state.bindingId === null) return state;
      if (event.combo === null) {
        return { ...state, heldModifiers: event.held };
      }
      return {
        ...state,
        capturedCombos: [...state.capturedCombos, event.combo],
        heldModifiers: null,
      };
    case "backspace":
      if (state.bindingId === null || state.capturedCombos.length === 0) return state;
      return { ...state, capturedCombos: state.capturedCombos.slice(0, -1) };
    default:
      return state;
  }
}

/** Whether the current capture can be saved: at least one combo and no conflict. */
export function canSaveCapture(state: CaptureState): boolean {
  return state.capturedCombos.length > 0 && state.conflict === null;
}

/** The persisted override string: chord segments joined by a single space. */
export function capturedComboString(state: CaptureState): string {
  return state.capturedCombos.join(" ");
}
