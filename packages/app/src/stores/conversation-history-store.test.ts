import { describe, expect, it } from "vitest";
import {
  createConversationHistory,
  selectConversationCanGoBack,
  selectConversationCanGoForward,
  stepBackConversationHistory,
  stepForwardConversationHistory,
  useConversationHistoryStore,
  visitConversationRoute,
  type ConversationHistoryCoreState,
} from "./conversation-history-store";

describe("conversation-history core state", () => {
  it("starts empty with no navigable history", () => {
    const state = createConversationHistory();

    expect(state.entries).toEqual([]);
    expect(state.index).toBe(-1);
    expect(selectConversationCanGoBack(state)).toBe(false);
    expect(selectConversationCanGoForward(state)).toBe(false);
  });

  it("visiting the first route records it but leaves nothing to step to", () => {
    const state = visitConversationRoute(createConversationHistory(), "/a");

    expect(state.entries).toEqual(["/a"]);
    expect(state.index).toBe(0);
    expect(selectConversationCanGoBack(state)).toBe(false);
    expect(selectConversationCanGoForward(state)).toBe(false);
  });

  it("visiting a second route makes back available but not forward", () => {
    let state = visitConversationRoute(createConversationHistory(), "/a");
    state = visitConversationRoute(state, "/b");

    expect(state.entries).toEqual(["/a", "/b"]);
    expect(state.index).toBe(1);
    expect(selectConversationCanGoBack(state)).toBe(true);
    expect(selectConversationCanGoForward(state)).toBe(false);
  });

  it("revisiting the current route is a no-op and preserves identity", () => {
    const visited = visitConversationRoute(createConversationHistory(), "/a");
    const again = visitConversationRoute(visited, "/a");

    expect(again).toBe(visited);
  });

  it("stepping back returns the previous route and enables forward", () => {
    let state = visitConversationRoute(createConversationHistory(), "/a");
    state = visitConversationRoute(state, "/b");

    const back = stepBackConversationHistory(state);

    expect(back.route).toBe("/a");
    expect(back.state.index).toBe(0);
    expect(selectConversationCanGoBack(back.state)).toBe(false);
    expect(selectConversationCanGoForward(back.state)).toBe(true);
  });

  it("stepping forward returns the next route and restores the tip", () => {
    let state = visitConversationRoute(createConversationHistory(), "/a");
    state = visitConversationRoute(state, "/b");
    state = stepBackConversationHistory(state).state;

    const forward = stepForwardConversationHistory(state);

    expect(forward.route).toBe("/b");
    expect(forward.state.index).toBe(1);
    expect(selectConversationCanGoForward(forward.state)).toBe(false);
  });

  it("cannot step back past the oldest entry", () => {
    const state = visitConversationRoute(createConversationHistory(), "/a");

    const back = stepBackConversationHistory(state);

    expect(back.route).toBeNull();
    expect(back.state).toBe(state);
  });

  it("cannot step forward past the newest entry", () => {
    let state = visitConversationRoute(createConversationHistory(), "/a");
    state = visitConversationRoute(state, "/b");

    const forward = stepForwardConversationHistory(state);

    expect(forward.route).toBeNull();
    expect(forward.state).toBe(state);
  });

  it("visiting a new route after stepping back truncates the forward stack", () => {
    let state = visitConversationRoute(createConversationHistory(), "/a");
    state = visitConversationRoute(state, "/b");
    state = visitConversationRoute(state, "/c");
    state = stepBackConversationHistory(state).state; // back at /b, forward = [/c]

    state = visitConversationRoute(state, "/d");

    expect(state.entries).toEqual(["/a", "/b", "/d"]);
    expect(state.index).toBe(2);
    expect(selectConversationCanGoForward(state)).toBe(false);
  });
});

describe("useConversationHistoryStore", () => {
  function resetStore() {
    const fresh: ConversationHistoryCoreState = createConversationHistory();
    useConversationHistoryStore.setState({ entries: fresh.entries, index: fresh.index });
  }

  it("drives back/forward navigation through dispatched routes", () => {
    resetStore();
    const store = useConversationHistoryStore.getState();

    store.visit("/a");
    store.visit("/b");

    expect(useConversationHistoryStore.getState().goBack()).toBe("/a");
    expect(useConversationHistoryStore.getState().goForward()).toBe("/b");
    // No history left in either direction.
    expect(useConversationHistoryStore.getState().goForward()).toBeNull();
  });
});
