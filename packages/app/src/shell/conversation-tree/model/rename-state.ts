import type { Editing, RenameError } from "./types";

export type ActiveEditing = Exclude<Editing, null>;

export type BeginRenameInput =
  | { readonly kind: "project"; readonly targetId: string; readonly name: string }
  | {
      readonly kind: "conversation";
      readonly targetId: string;
      readonly workspaceId: string;
      readonly name: string;
    };

export type RenameValidation =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: RenameError };

/** Enter inline editing with an isolated draft so live snapshot updates cannot overwrite user input. */
export function beginRename(input: BeginRenameInput): ActiveEditing {
  if (input.kind === "project") {
    return {
      kind: "project",
      targetId: input.targetId,
      originalName: input.name,
      draftName: input.name,
      error: null,
    };
  }
  return {
    kind: "conversation",
    targetId: input.targetId,
    workspaceId: input.workspaceId,
    originalName: input.name,
    draftName: input.name,
    error: null,
  };
}

/** Replace the user's draft and clear any stale validation result from the prior submission. */
export function updateRenameDraft(editing: ActiveEditing, draftName: string): ActiveEditing {
  return { ...editing, draftName, error: null };
}

/** Attach a validation failure without discarding the draft the user can still correct. */
export function setRenameError(editing: ActiveEditing, error: RenameError): ActiveEditing {
  return { ...editing, error };
}

/** Validate user input at the commit boundary and return the normalized RPC value. */
export function validateRenameName(name: string): RenameValidation {
  const normalized = name.trim();
  if (normalized.length === 0) {
    return { ok: false, error: "empty" };
  }
  return { ok: true, name: normalized };
}

/** Exit either editing variant through the model's single non-editing state. */
export function cancelRename(_editing: ActiveEditing): null {
  return null;
}
