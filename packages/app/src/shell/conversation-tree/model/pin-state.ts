import { z } from "zod";
import type { ConversationTreePinTarget } from "./types";

export const SIDEBAR_PINS_STORAGE_KEY = "sidebar-pins";

const SharedPinTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), projectKey: z.string() }),
  z.object({ kind: z.literal("workspace"), workspaceId: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
]);

const SidebarPinsEnvelopeSchema = z.object({
  state: z.object({ pinnedByServerId: z.record(z.string(), z.array(z.unknown())) }),
  version: z.number().optional(),
});

type SharedPinTarget = z.infer<typeof SharedPinTargetSchema>;

export interface SidebarPinsStorageValue {
  readonly state: {
    readonly pinnedByServerId: Record<string, SharedPinTarget[]>;
  };
  readonly version: 0;
}

/** Produce the shared sidebar identity used for dedupe, lookup, and persistence ordering. */
export function pinTargetKey(target: ConversationTreePinTarget): string {
  if (target.kind === "project") {
    return `project:${target.projectKey}`;
  }
  return `workspace:${target.workspaceId}`;
}

/** Report whether a project or workspace target is present in the ordered pin collection. */
export function isPinned(
  pins: readonly ConversationTreePinTarget[],
  target: ConversationTreePinTarget,
): boolean {
  const key = pinTargetKey(target);
  return pins.some((candidate) => pinTargetKey(candidate) === key);
}

/** Toggle one target while preserving the order and references of every untouched pin. */
export function togglePin(
  pins: readonly ConversationTreePinTarget[],
  target: ConversationTreePinTarget,
): ConversationTreePinTarget[] {
  const key = pinTargetKey(target);
  if (pins.some((candidate) => pinTargetKey(candidate) === key)) {
    return pins.filter((candidate) => pinTargetKey(candidate) !== key);
  }
  return [...pins, target];
}

/** Read this module's two target kinds from the existing shared Zustand persistence envelope. */
export function readConversationTreePins(
  persisted: unknown,
  serverId: string,
): ConversationTreePinTarget[] {
  const sharedPins = readSharedPins(persisted)[serverId] ?? [];
  const treePins = sharedPins.filter(isConversationTreePinTarget);
  const deduped: ConversationTreePinTarget[] = [];
  const seen = new Set<string>();
  for (const target of treePins) {
    const key = pinTargetKey(target);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(target);
    }
  }
  return deduped;
}

/** Replace one server's tree-owned pins while preserving all other shared sidebar target owners. */
export function mergeConversationTreePins(
  persisted: unknown,
  serverId: string,
  pins: readonly ConversationTreePinTarget[],
): SidebarPinsStorageValue {
  const sharedPins = readSharedPins(persisted);
  const currentPins = sharedPins[serverId] ?? [];
  const nextPins: SharedPinTarget[] = currentPins.filter((target) => target.kind === "agent");
  const seen = new Set(nextPins.map(sharedPinTargetKey));
  for (const target of pins) {
    const key = pinTargetKey(target);
    if (!seen.has(key)) {
      seen.add(key);
      nextPins.push(target);
    }
  }

  const pinnedByServerId: Record<string, SharedPinTarget[]> = { ...sharedPins };
  if (nextPins.length === 0) {
    delete pinnedByServerId[serverId];
  } else {
    pinnedByServerId[serverId] = nextPins;
  }
  return { state: { pinnedByServerId }, version: 0 };
}

/** Parse the shared storage boundary and retain only current, structurally valid pin targets. */
function readSharedPins(persisted: unknown): Record<string, SharedPinTarget[]> {
  const envelope = SidebarPinsEnvelopeSchema.safeParse(persisted);
  if (!envelope.success) {
    return {};
  }
  const pinnedByServerId: Record<string, SharedPinTarget[]> = {};
  for (const [serverId, rawTargets] of Object.entries(envelope.data.state.pinnedByServerId)) {
    const targets: SharedPinTarget[] = [];
    for (const rawTarget of rawTargets) {
      const parsed = SharedPinTargetSchema.safeParse(rawTarget);
      if (parsed.success) {
        targets.push(parsed.data);
      }
    }
    if (targets.length > 0) {
      pinnedByServerId[serverId] = targets;
    }
  }
  return pinnedByServerId;
}

/** Narrow the shared target union to the project/workspace kinds owned by this tree. */
function isConversationTreePinTarget(target: SharedPinTarget): target is ConversationTreePinTarget {
  return target.kind === "project" || target.kind === "workspace";
}

/** Produce identities for all three owners sharing the sidebar-pins record. */
function sharedPinTargetKey(target: SharedPinTarget): string {
  if (target.kind === "agent") {
    return `agent:${target.agentId}`;
  }
  return pinTargetKey(target);
}
