import { describe, expect, it } from "vitest";
import { canLaunchPanel, getBuiltInLaunchOrder } from "./catalog";

it("keeps all launch groups inside their fixed workbench role", () => {
  for (const surface of ["menu", "panel"] as const) {
    const input = { host: "conversations" as const, surface, panePanelKinds: [] };
    expect(canLaunchPanel({ ...input, kind: "agent" })).toBe(true);
    expect(canLaunchPanel({ ...input, kind: "terminal" })).toBe(false);
    expect(canLaunchPanel({ ...input, kind: "plugin" })).toBe(false);
    expect(canLaunchPanel({ ...input, kind: "file" })).toBe(false);
    expect(canLaunchPanel({ ...input, host: "content", kind: "terminal" })).toBe(true);
    expect(canLaunchPanel({ ...input, host: "content", kind: "plugin" })).toBe(true);
    expect(canLaunchPanel({ ...input, host: "content", kind: "agent" })).toBe(false);
  }
});

describe("getBuiltInLaunchOrder", () => {
  it("leads with creating work in a primary pane", () => {
    expect(getBuiltInLaunchOrder("primary")).toEqual([
      "agent",
      "terminal",
      "changes",
      "diff",
      "files",
      "browser",
      "pullRequest",
    ]);
  });

  it("leads with companion tools in a supporting pane", () => {
    expect(getBuiltInLaunchOrder("supporting")).toEqual([
      "changes",
      "terminal",
      "diff",
      "files",
      "agent",
      "browser",
      "pullRequest",
    ]);
  });
});
