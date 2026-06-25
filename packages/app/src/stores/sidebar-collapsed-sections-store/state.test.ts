import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setAllProjectsCollapsed,
  setProjectCollapsed,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return { collapsedProjectKeys: new Set(), collapsedStatusGroupKeys: new Set() };
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "project-a", true);
    state = toggleProjectCollapsed(state, "project-b");
    state = toggleProjectCollapsed(state, "project-a");
    state = toggleStatusGroupCollapsed(state, "running");

    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-b"]);
    expect(Array.from(state.collapsedStatusGroupKeys)).toEqual(["running"]);
  });

  it("collapses and expands all given project keys in bulk", () => {
    let state = emptyState();
    state = setProjectCollapsed(state, "project-c", true); // pre-existing, outside the set

    state = setAllProjectsCollapsed(state, ["project-a", "project-b"], true);
    expect(Array.from(state.collapsedProjectKeys).sort()).toEqual([
      "project-a",
      "project-b",
      "project-c",
    ]);

    state = setAllProjectsCollapsed(state, ["project-a", "project-b"], false);
    // only the given keys are expanded; unrelated collapsed keys are untouched
    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-c"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedStatusGroupKeys: new Set(["running"]),
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedStatusGroupKeys: ["running"],
    });
  });

  it("restores collapsed project keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a", "project-b"]);
    expect(Array.from(restored.collapsedStatusGroupKeys)).toEqual([]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({ collapsedProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
  });
});
