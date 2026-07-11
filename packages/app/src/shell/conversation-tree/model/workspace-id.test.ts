import { describe, expect, test } from "vitest";
import { normalizeWorkspaceId } from "./workspace-id";

describe("normalizeWorkspaceId", () => {
  test("trims stable workspace ids and rejects missing or blank identities", () => {
    expect(normalizeWorkspaceId("  workspace-1 \n")).toBe("workspace-1");
    expect(normalizeWorkspaceId("   ")).toBeNull();
    expect(normalizeWorkspaceId(null)).toBeNull();
    expect(normalizeWorkspaceId(undefined)).toBeNull();
  });
});
