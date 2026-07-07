// Inline-edit blur exit decision (§3.10), pure. The store owns the two exits (commitEdit / cancelEdit);
// this picks which one a blur / outside-click maps to, so the component stays a dispatcher with no
// validation branch. Enter is always commitEdit (the store decides keep-open vs discard there); blur
// differs only for rename-illegal, which must RESTORE (cancel) on blur rather than stay open.
//
// Rule: a blur commits only when the draft is legal AND would change something — new-*: any legal name;
// rename: a legal name different from the original. Everything else (empty, illegal, duplicate, or a
// rename back to the original) cancels: new-* discards the placeholder, rename restores the old name.

import type { Editing } from "../model/types";

/** Decide whether a blur on the inline editor should commit the edit or cancel it (§3.10). */
export function resolveBlurExit(editing: NonNullable<Editing>): "commit" | "cancel" {
  if (editing.error !== null) {
    return "cancel";
  }
  if (editing.kind === "rename" && editing.draftName.trim() === editing.originalName) {
    return "cancel";
  }
  return "commit";
}
