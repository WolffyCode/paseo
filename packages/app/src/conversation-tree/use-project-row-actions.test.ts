import { describe, expect, it } from "vitest";
import { deriveProjectActionAvailability } from "./project-action-availability";

describe("deriveProjectActionAvailability", () => {
  it("enables reveal only when BOTH the desktop bridge and a working dir are present", () => {
    expect(
      deriveProjectActionAvailability({ workingDir: "/repo/main", hasDesktopBridge: true })
        .canReveal,
    ).toBe(true);
    // no bridge (web/native) → no reveal even with a dir
    expect(
      deriveProjectActionAvailability({ workingDir: "/repo/main", hasDesktopBridge: false })
        .canReveal,
    ).toBe(false);
    // bridge but no dir (e.g. remote project without a local checkout) → no reveal
    expect(
      deriveProjectActionAvailability({ workingDir: undefined, hasDesktopBridge: true }).canReveal,
    ).toBe(false);
  });

  it("enables worktree creation whenever there is a working dir, bridge or not", () => {
    expect(
      deriveProjectActionAvailability({ workingDir: "/repo/main", hasDesktopBridge: false })
        .canCreateWorktree,
    ).toBe(true);
    expect(
      deriveProjectActionAvailability({ workingDir: undefined, hasDesktopBridge: true })
        .canCreateWorktree,
    ).toBe(false);
    // empty string is not a usable dir
    expect(
      deriveProjectActionAvailability({ workingDir: "", hasDesktopBridge: true }).canCreateWorktree,
    ).toBe(false);
  });
});
