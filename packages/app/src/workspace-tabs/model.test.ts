import { describe, expect, it } from "vitest";
import { buildWorkspaceTabPersistenceKey, parseWorkspaceTabPersistenceKey } from "./model";

describe("buildWorkspaceTabPersistenceKey", () => {
  it("trims and joins opaque server and workspace ids", () => {
    expect(
      buildWorkspaceTabPersistenceKey({
        serverId: "  server-1  ",
        workspaceId: "  setup\\workspace\\  ",
      }),
    ).toBe("server-1:setup\\workspace\\");
  });

  it("rejects incomplete identities", () => {
    expect(buildWorkspaceTabPersistenceKey({ serverId: "", workspaceId: "workspace" })).toBeNull();
    expect(buildWorkspaceTabPersistenceKey({ serverId: "server", workspaceId: "  " })).toBeNull();
  });
});

describe("parseWorkspaceTabPersistenceKey", () => {
  it("splits a key back into its server and workspace, keeping colons in the workspace id", () => {
    const key = buildWorkspaceTabPersistenceKey({ serverId: "srv_1", workspaceId: "C:\\repo" });
    expect(parseWorkspaceTabPersistenceKey(key ?? "")).toEqual({
      serverId: "srv_1",
      workspaceId: "C:\\repo",
    });
  });

  it("rejects keys without both parts", () => {
    expect(parseWorkspaceTabPersistenceKey("srv_1")).toBeNull();
    expect(parseWorkspaceTabPersistenceKey(":workspace")).toBeNull();
    expect(parseWorkspaceTabPersistenceKey("srv_1:")).toBeNull();
  });
});
