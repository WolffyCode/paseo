/**
 * A pin target identifies what was pinned in the sidebar. Phase 1 only wires the
 * "project" kind end-to-end, but the union models all three kinds up front so the
 * persisted shape and key function never change when workspace/agent pinning lands.
 */
export type PinTarget =
  | { kind: "project"; projectKey: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "agent"; agentId: string };

/** Stable identity for a pin target — used for dedupe, lookup, and React keys. */
export function pinTargetKey(target: PinTarget): string {
  switch (target.kind) {
    case "project":
      return `project:${target.projectKey}`;
    case "workspace":
      return `workspace:${target.workspaceId}`;
    case "agent":
      return `agent:${target.agentId}`;
  }
}

export interface SidebarPinsState {
  /** Pins keyed by server id. Array order is pin order (append on pin). */
  pinnedByServerId: Record<string, PinTarget[]>;
}

export interface PersistedSidebarPins {
  pinnedByServerId?: unknown;
}

/** Read a server's pinned targets in pin order. Returns an empty array when absent. */
export function getPinnedTargets(state: SidebarPinsState, serverId: string): PinTarget[] {
  return state.pinnedByServerId[serverId] ?? [];
}

export function isPinned(state: SidebarPinsState, serverId: string, target: PinTarget): boolean {
  const key = pinTargetKey(target);
  const list = state.pinnedByServerId[serverId];
  if (!list) return false;
  return list.some((entry) => pinTargetKey(entry) === key);
}

/** Toggle a pin on/off for a server, preserving order for the untouched entries. */
export function togglePin(
  state: SidebarPinsState,
  serverId: string,
  target: PinTarget,
): SidebarPinsState {
  const key = pinTargetKey(target);
  const current = state.pinnedByServerId[serverId] ?? [];
  const alreadyPinned = current.some((entry) => pinTargetKey(entry) === key);

  const nextList = alreadyPinned
    ? current.filter((entry) => pinTargetKey(entry) !== key)
    : [...current, target];

  const nextByServer = { ...state.pinnedByServerId };
  if (nextList.length === 0) {
    delete nextByServer[serverId];
  } else {
    nextByServer[serverId] = nextList;
  }

  return { ...state, pinnedByServerId: nextByServer };
}

export function serializeSidebarPins(state: SidebarPinsState): {
  pinnedByServerId: Record<string, PinTarget[]>;
} {
  return { pinnedByServerId: state.pinnedByServerId };
}

export function mergePersistedSidebarPins<S extends SidebarPinsState>(
  persisted: PersistedSidebarPins | undefined,
  current: S,
): S {
  const restored = deserializePinnedByServerId(persisted?.pinnedByServerId);
  if (restored === undefined) return current;
  return { ...current, pinnedByServerId: restored };
}

function deserializePinnedByServerId(value: unknown): Record<string, PinTarget[]> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const result: Record<string, PinTarget[]> = {};
  for (const [serverId, rawList] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawList)) continue;
    const targets = rawList
      .map(deserializePinTarget)
      .filter((target): target is PinTarget => target !== null);
    if (targets.length > 0) {
      result[serverId] = dedupeByKey(targets);
    }
  }
  return result;
}

function deserializePinTarget(value: unknown): PinTarget | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case "project":
      return typeof candidate.projectKey === "string"
        ? { kind: "project", projectKey: candidate.projectKey }
        : null;
    case "workspace":
      return typeof candidate.workspaceId === "string"
        ? { kind: "workspace", workspaceId: candidate.workspaceId }
        : null;
    case "agent":
      return typeof candidate.agentId === "string"
        ? { kind: "agent", agentId: candidate.agentId }
        : null;
    default:
      return null;
  }
}

function dedupeByKey(targets: PinTarget[]): PinTarget[] {
  const seen = new Set<string>();
  const result: PinTarget[] = [];
  for (const target of targets) {
    const key = pinTargetKey(target);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(target);
  }
  return result;
}
