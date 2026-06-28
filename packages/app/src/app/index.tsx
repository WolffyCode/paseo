import { Redirect, usePathname } from "expo-router";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useEarliestOnlineHostServerId, useHostRuntimeBootstrapState } from "@/app/_layout";
import { resolveStartupRoute } from "@/app/host-runtime-bootstrap";
import { useHostRegistryStatus, useHosts } from "@/runtime/host-runtime";
import { useOnboardingStore, useOnboardingStoreHydrated } from "@/stores/onboarding-store";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";

const isDesktop = shouldUseDesktopDaemon();

// Root cold-start surface. Holds the connecting splash while startup state hydrates, then
// declaratively redirects to the resolved landing — a fresh new-conversation on an online host,
// or onboarding. The redirect is a <Redirect> (router.replace), never an imperative navigate: it
// replaces this route so the screen unmounts itself instead of stranding a full-screen splash
// beside the host shell, and React Navigation seeds the target h/[serverId] group in one pass.
// Determinism relies on the route navigator keeping a stable mount across the chrome flip — see
// home-shell, which never relocates {children}.
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
