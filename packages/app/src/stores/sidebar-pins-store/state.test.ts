import { describe, expect, it } from "vitest";
import {
  getPinnedTargets,
  isPinned,
  mergePersistedSidebarPins,
  type PinTarget,
  pinTargetKey,
  serializeSidebarPins,
  type SidebarPinsState,
  togglePin,
} from "@/stores/sidebar-pins-store/state";

function emptyState(): SidebarPinsState {
  return { pinnedByServerId: {} };
}

const project = (projectKey: string): PinTarget => ({ kind: "project", projectKey });

describe("sidebar pins transitions", () => {
  it("derives a stable key per pin kind", () => {
    expect(pinTargetKey({ kind: "project", projectKey: "p1" })).toBe("project:p1");
    expect(pinTargetKey({ kind: "workspace", workspaceId: "w1" })).toBe("workspace:w1");
    expect(pinTargetKey({ kind: "agent", agentId: "a1" })).toBe("agent:a1");
  });

  it("toggles a project pin on, then off", () => {
    let state = emptyState();
    const target = project("p1");

    expect(isPinned(state, "host-a", target)).toBe(false);

    state = togglePin(state, "host-a", target);
    expect(isPinned(state, "host-a", target)).toBe(true);
    expect(getPinnedTargets(state, "host-a")).toEqual([target]);

    state = togglePin(state, "host-a", target);
    expect(isPinned(state, "host-a", target)).toBe(false);
    // server key is cleaned up when its last pin is removed
    expect(getPinnedTargets(state, "host-a")).toEqual([]);
    expect(state.pinnedByServerId).toEqual({});
  });

  it("appends pins in pin order", () => {
    let state = emptyState();
    state = togglePin(state, "host-a", project("p1"));
    state = togglePin(state, "host-a", project("p2"));
    state = togglePin(state, "host-a", project("p3"));

    expect(getPinnedTargets(state, "host-a").map(pinTargetKey)).toEqual([
      "project:p1",
      "project:p2",
      "project:p3",
    ]);

    // unpinning the middle one preserves the order of the rest
    state = togglePin(state, "host-a", project("p2"));
    expect(getPinnedTargets(state, "host-a").map(pinTargetKey)).toEqual([
      "project:p1",
      "project:p3",
    ]);
  });

  it("isolates pins per server", () => {
    let state = emptyState();
    state = togglePin(state, "host-a", project("p1"));
    state = togglePin(state, "host-b", project("p2"));

    expect(isPinned(state, "host-a", project("p1"))).toBe(true);
    expect(isPinned(state, "host-a", project("p2"))).toBe(false);
    expect(isPinned(state, "host-b", project("p2"))).toBe(true);
    expect(isPinned(state, "host-b", project("p1"))).toBe(false);
  });

  it("serializes and restores pins from persisted preferences", () => {
    let state = emptyState();
    state = togglePin(state, "host-a", project("p1"));
    state = togglePin(state, "host-a", { kind: "workspace", workspaceId: "w9" });

    const serialized = serializeSidebarPins(state);
    expect(serialized).toEqual({
      pinnedByServerId: {
        "host-a": [
          { kind: "project", projectKey: "p1" },
          { kind: "workspace", workspaceId: "w9" },
        ],
      },
    });

    const restored = mergePersistedSidebarPins(serialized, emptyState());
    expect(restored.pinnedByServerId).toEqual(state.pinnedByServerId);
  });

  it("drops malformed persisted entries and dedupes by key", () => {
    const restored = mergePersistedSidebarPins(
      {
        pinnedByServerId: {
          "host-a": [
            { kind: "project", projectKey: "p1" },
            { kind: "project" }, // missing projectKey -> dropped
            { kind: "project", projectKey: "p1" }, // duplicate -> deduped
            { kind: "mystery", id: "x" }, // unknown kind -> dropped
            42, // non-object -> dropped
          ],
          "host-empty": [{ kind: "project" }], // all dropped -> server omitted
        },
      },
      emptyState(),
    );

    expect(restored.pinnedByServerId).toEqual({
      "host-a": [{ kind: "project", projectKey: "p1" }],
    });
  });

  it("keeps the existing state when persisted preferences are absent or unusable", () => {
    const current = emptyState();
    expect(mergePersistedSidebarPins(undefined, current)).toBe(current);
    expect(mergePersistedSidebarPins({}, current)).toBe(current);
    expect(mergePersistedSidebarPins({ pinnedByServerId: null }, current)).toBe(current);
  });
});
