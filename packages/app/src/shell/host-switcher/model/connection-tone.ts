import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";

export type HostConnectionTone = "online" | "connecting" | "offline";

/** Collapse five runtime states into the switcher's three stable visual and click-routing tones. */
export function selectHostConnectionTone(status: HostRuntimeConnectionStatus): HostConnectionTone {
  if (status === "online") {
    return "online";
  }
  if (status === "idle" || status === "connecting") {
    return "connecting";
  }
  return "offline";
}
