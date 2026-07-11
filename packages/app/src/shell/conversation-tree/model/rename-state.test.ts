import { describe, expect, test } from "vitest";
import {
  beginRename,
  cancelRename,
  setRenameError,
  updateRenameDraft,
  validateRenameName,
} from "./rename-state";

describe("conversation tree rename state", () => {
  test("constructs discriminated project and conversation editing states", () => {
    expect(beginRename({ kind: "project", targetId: "p1", name: "Project" })).toEqual({
      kind: "project",
      targetId: "p1",
      originalName: "Project",
      draftName: "Project",
      error: null,
    });
    expect(
      beginRename({
        kind: "conversation",
        targetId: "agent-1",
        workspaceId: "workspace-1",
        name: "Conversation",
      }),
    ).toEqual({
      kind: "conversation",
      targetId: "agent-1",
      workspaceId: "workspace-1",
      originalName: "Conversation",
      draftName: "Conversation",
      error: null,
    });
  });

  test("updates drafts, records validation errors, and clears them on the next edit", () => {
    const editing = beginRename({ kind: "project", targetId: "p1", name: "Project" });
    const invalid = setRenameError(editing, "empty");
    const corrected = updateRenameDraft(invalid, "Renamed");

    expect(invalid.error).toBe("empty");
    expect(corrected).toMatchObject({ draftName: "Renamed", error: null });
  });

  test("rejects empty names and returns the trimmed RPC value for valid names", () => {
    expect(validateRenameName(" \n ")).toEqual({ ok: false, error: "empty" });
    expect(validateRenameName("  Renamed project  ")).toEqual({
      ok: true,
      name: "Renamed project",
    });
  });

  test("cancels either editing variant into the single null state", () => {
    const editing = beginRename({
      kind: "conversation",
      targetId: "agent-1",
      workspaceId: "workspace-1",
      name: "Conversation",
    });

    expect(cancelRename(editing)).toBeNull();
  });
});
