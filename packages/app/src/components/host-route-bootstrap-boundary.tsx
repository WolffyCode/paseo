import type { ReactNode } from "react";
import { useHostRuntimeBootstrapState } from "@/app/_layout";
import { useHostRegistryStatus } from "@/runtime/host-runtime";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";

// Gates a host leaf route behind the connecting splash while the managed daemon is still starting
// or the host registry is loading, so workspace content never renders against a not-yet-ready host.
// Owned by the leaf route (not the [serverId] group layout) so the host Slot stays mounted and the
// nested workspace URL segments survive React Navigation web reserialization.
export function HostRouteBootstrapBoundary({ children }: { children: ReactNode }) {
  const bootstrapState = useHostRuntimeBootstrapState();
  const hostRegistryStatus = useHostRegistryStatus();

  if (bootstrapState.startupBlocker.kind !== "none" || hostRegistryStatus === "loading") {
    return <StartupSplashScreen bootstrapState={bootstrapState} />;
  }

  return children;
}
