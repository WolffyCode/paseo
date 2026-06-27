import { describe, expect, it } from "vitest";
import {
  projectDisplayNameFromProjectId,
  projectIconPlaceholderLabelFromDisplayName,
  rawProjectCustomName,
  resolveProjectTreeName,
} from "./project-display-name";

describe("projectDisplayNameFromProjectId", () => {
  it("shows owner and repo for GitHub remote ids", () => {
    expect(projectDisplayNameFromProjectId("remote:github.com/getpaseo/paseo")).toBe(
      "getpaseo/paseo",
    );
  });

  it("shows the trailing directory name for local projects", () => {
    expect(projectDisplayNameFromProjectId("/Users/me/dev/paseo")).toBe("paseo");
  });
});

describe("projectIconPlaceholderLabelFromDisplayName", () => {
  it("uses repo name instead of owner for GitHub-style display names", () => {
    expect(projectIconPlaceholderLabelFromDisplayName("getpaseo/paseo")).toBe("paseo");
  });

  it("returns the original display name when it has no path separator", () => {
    expect(projectIconPlaceholderLabelFromDisplayName("paseo")).toBe("paseo");
  });
});

describe("rawProjectCustomName", () => {
  it("returns null when the display name is just the auto github slug (no rename)", () => {
    // Server sends projectDisplayName = customName ?? slug; an un-renamed github project's display
    // name equals its slug, so we recover customName = null (→ caller falls back to basename).
    expect(rawProjectCustomName("WolffyCode/selo", "remote:github.com/WolffyCode/selo")).toBeNull();
  });

  it("returns the name when it is a genuine rename (differs from the slug)", () => {
    expect(rawProjectCustomName("paseo-main", "remote:github.com/WolffyCode/paseo")).toBe(
      "paseo-main",
    );
  });

  it("returns null for an un-renamed local project (display name equals the basename slug)", () => {
    expect(rawProjectCustomName("bill-xml-diff", "/Users/me/dev/bill-xml-diff")).toBeNull();
  });

  it("returns null for empty/whitespace display names", () => {
    expect(rawProjectCustomName("", "remote:github.com/a/b")).toBeNull();
    expect(rawProjectCustomName("   ", "remote:github.com/a/b")).toBeNull();
    expect(rawProjectCustomName(null, "remote:github.com/a/b")).toBeNull();
  });

  it("defaults an un-renamed github project to its local directory basename, not the slug", () => {
    // The 反馈 #49 scenario: selo has a local checkout but no custom name → show "selo".
    const projectId = "remote:github.com/WolffyCode/selo";
    const name = resolveProjectTreeName({
      customName: rawProjectCustomName("WolffyCode/selo", projectId),
      workingDir: "/Users/wangbingkun/Desktop/coding/person/WolffyCode/selo",
      projectId,
    });
    expect(name).toBe("selo");
  });

  it("still honours a real rename over the basename", () => {
    const projectId = "remote:github.com/WolffyCode/paseo";
    const name = resolveProjectTreeName({
      customName: rawProjectCustomName("paseo-main", projectId),
      workingDir: "/Users/wangbingkun/Desktop/coding/person/WolffyCode/paseo-checkout",
      projectId,
    });
    expect(name).toBe("paseo-main");
  });
});
