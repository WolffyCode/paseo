import { create } from "zustand";

/**
 * Conversation browse history — the back/forward stack behind the window-chrome
 * ‹ › arrows (desktop only). It is a pure route stack with a single cursor, modelled
 * after a browser's session history: visiting a new route truncates any forward
 * entries, so the arrows always reflect a linear path the user can replay.
 *
 * Kept deliberately minimal for the P1 skeleton: it stores route strings only and
 * holds no persistence (browse history is session-scoped, not durable state).
 */
export interface ConversationHistoryCoreState {
  /** Routes the user has navigated to, oldest first. */
  entries: string[];
  /** Cursor into `entries`; -1 when empty. */
  index: number;
}

/** Fresh empty history with the cursor parked before the first entry. */
export function createConversationHistory(): ConversationHistoryCoreState {
  return { entries: [], index: -1 };
}

/** True when there is an older route the back arrow can step to. */
export function selectConversationCanGoBack(state: ConversationHistoryCoreState): boolean {
  return state.index > 0;
}

/** True when there is a newer route the forward arrow can step to. */
export function selectConversationCanGoForward(state: ConversationHistoryCoreState): boolean {
  return state.index < state.entries.length - 1;
}

/**
 * Record a visit. Re-entering the current route is a no-op (returns the same
 * reference so React bails out); any other route drops the forward stack and
 * becomes the new tip — matching browser session-history semantics.
 */
export function visitConversationRoute(
  state: ConversationHistoryCoreState,
  route: string,
): ConversationHistoryCoreState {
  if (state.entries[state.index] === route) {
    return state;
  }
  const entries = [...state.entries.slice(0, state.index + 1), route];
  return { entries, index: entries.length - 1 };
}

/**
 * Move the cursor one step toward older history. Returns the route to navigate to,
 * or null (with the state untouched) when already at the oldest entry — the caller
 * navigates only on a non-null route so the arrow can be a pure dispatch.
 */
export function stepBackConversationHistory(state: ConversationHistoryCoreState): {
  state: ConversationHistoryCoreState;
  route: string | null;
} {
  if (!selectConversationCanGoBack(state)) {
    return { state, route: null };
  }
  const index = state.index - 1;
  return { state: { entries: state.entries, index }, route: state.entries[index] ?? null };
}

/**
 * Move the cursor one step toward newer history. Returns the route to navigate to,
 * or null (state untouched) when already at the tip.
 */
export function stepForwardConversationHistory(state: ConversationHistoryCoreState): {
  state: ConversationHistoryCoreState;
  route: string | null;
} {
  if (!selectConversationCanGoForward(state)) {
    return { state, route: null };
  }
  const index = state.index + 1;
  return { state: { entries: state.entries, index }, route: state.entries[index] ?? null };
}

export interface ConversationHistoryStore extends ConversationHistoryCoreState {
  /** Push a route the user navigated to (typically from a pathname effect). */
  visit: (route: string) => void;
  /** Step back and return the route to navigate to, or null when at the oldest entry. */
  goBack: () => string | null;
  /** Step forward and return the route to navigate to, or null when at the tip. */
  goForward: () => string | null;
}

/**
 * Thin zustand wrapper over the pure history reducers. Components dispatch
 * visit/goBack/goForward and read can-go-* via the selectors above; all branching
 * lives in the pure functions so the navigation logic is testable without rendering.
 */
export const useConversationHistoryStore = create<ConversationHistoryStore>()((set, get) => ({
  ...createConversationHistory(),
  visit: (route) => set((state) => visitConversationRoute(state, route)),
  goBack: () => {
    const { state, route } = stepBackConversationHistory(get());
    if (route !== null) {
      set({ entries: state.entries, index: state.index });
    }
    return route;
  },
  goForward: () => {
    const { state, route } = stepForwardConversationHistory(get());
    if (route !== null) {
      set({ entries: state.entries, index: state.index });
    }
    return route;
  },
}));
