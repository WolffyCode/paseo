import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";

export type HostConnectionTone = "online" | "connecting" | "offline";

/**
 * Collapse the runtime's five connection states into the switcher's three-state
 * visual vocabulary (绿 online / 橙 connecting / 红 offline). One source of truth
 * keeps the pill, the dropdown rows and their status dots in agreement and makes
 * the rule testable without rendering. `idle` is a transient pre-connection state,
 * so it reads as amber "connecting" rather than a false red "offline".
 */
export function selectHostConnectionTone(status: HostRuntimeConnectionStatus): HostConnectionTone {
  switch (status) {
    case "online":
      return "online";
    case "connecting":
    case "idle":
      return "connecting";
    case "offline":
    case "error":
      return "offline";
  }
}
