import React from "react";
import { Redirect, usePathname } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useEarliestOnlineHostServerId, useHostRuntimeBootstrapState } from "@/app/_layout";
import { resolveStartupRoute } from "@/app/host-runtime-bootstrap";
import { useHostRegistryStatus, useHosts } from "@/runtime/host-runtime";
import { useOnboardingStore, useOnboardingStoreHydrated } from "@/stores/onboarding-store";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";

const isDesktop = shouldUseDesktopDaemon();

export default function Index() {
  const pathname = usePathname();
  const bootstrapState = useHostRuntimeBootstrapState();
  const anyOnlineHostServerId = useEarliestOnlineHostServerId();
  const hosts = useHosts();
  const hostRegistryStatus = useHostRegistryStatus();
  const hasSeenWelcome = useOnboardingStore((state) => state.hasSeenWelcome);
  const isOnboardingStoreHydrated = useOnboardingStoreHydrated();

  const startupRoute = resolveStartupRoute({
    route: { kind: "index", pathname },
    startupBlocker: bootstrapState.startupBlocker,
    hostRegistryStatus,
    hosts,
    anyOnlineHostServerId,
    isStartupStateHydrated: isOnboardingStoreHydrated,
    hasGivenUpWaitingForHost: bootstrapState.hasGivenUpWaitingForHost,
    hasSeenWelcome,
  });

  if (startupRoute.kind === "redirect") {
    return <Redirect href={startupRoute.href} />;
  }

  return <StartupSplashScreen bootstrapState={isDesktop ? bootstrapState : undefined} />;
}
