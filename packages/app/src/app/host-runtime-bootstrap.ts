import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { DaemonStartResult } from "@/runtime/daemon-start-service";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { Href } from "expo-router";
import {
  buildHostOpenProjectRoute,
  buildHostRootRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";

export interface HostRuntimeBootstrapStore {
  boot: () => void;
}

export interface HostRuntimeBootstrapDaemonStartService {
  start: () => Promise<DaemonStartResult>;
}

type HostRuntimeBootstrapStartGate = boolean | (() => boolean | Promise<boolean>);

export interface StartHostRuntimeBootstrapInput {
  store: HostRuntimeBootstrapStore;
}

// Loads the host registry at mount without deciding whether to connect, so the welcome gate can run first.
// Connection (probe / daemon-start) is deferred to connectLocalOnBoot once the welcome flag has hydrated.
export function startHostRuntimeBootstrap(input: StartHostRuntimeBootstrapInput): void {
  input.store.boot();
}

// Defers local connection until the one-time welcome has been seen: first run stays on welcome, later runs self-heal.
// The single place the "has seen welcome?" boot gate lives; callers only supply the welcome flag and the connect effect.
export function connectLocalOnBoot(input: {
  hasSeenWelcome: boolean;
  connectLocal: () => void;
}): void {
  if (!input.hasSeenWelcome) {
    return;
  }
  input.connectLocal();
}

// Starts the desktop daemon only when the configured startup gate permits it.
export function startDaemonIfGateAllows(input: {
  daemonStartService: HostRuntimeBootstrapDaemonStartService;
  shouldStartDaemon: HostRuntimeBootstrapStartGate;
  onGateError?: (message: string) => void;
}): void {
  const gate = input.shouldStartDaemon;
  if (typeof gate === "boolean") {
    if (gate) {
      void input.daemonStartService.start();
    }
    return;
  }

  void Promise.resolve()
    .then(() => gate())
    .then((shouldStartDaemon) => {
      if (shouldStartDaemon) {
        void input.daemonStartService.start();
      }
      return null;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      input.onGateError?.(`Failed to evaluate desktop daemon settings: ${message}`);
    });
}

const WELCOME_ROUTE: Href = "/welcome";

export type OnboardingPlatformCapability =
  | { kind: "desktop-local" }
  | { kind: "local-candidate" }
  | { kind: "remote-only" };

export type OnboardingLocalConnectState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "failed"; reason: string };

const LOCAL_DAEMON_TIMEOUT_REASON = "Timed out waiting for the local daemon.";

export interface ResolveOnboardingPhaseInput {
  hasSeenWelcome: boolean;
  platformCapability: OnboardingPlatformCapability;
  localConnect: OnboardingLocalConnectState;
  userRequestedRemote: boolean;
}

export interface ResolveOnboardingPlatformCapabilityInput {
  isDesktopLocalRuntime: boolean;
  hasLocalDaemonCandidate: boolean;
}

export interface OnboardingLocalHostSnapshot {
  connectionStatus: HostRuntimeConnectionStatus;
  lastError: string | null;
}

export interface ResolveOnboardingLocalConnectStateInput {
  hostSnapshots: readonly OnboardingLocalHostSnapshot[];
  splashError: string | null;
  startupBlockerKind: StartupBlocker["kind"];
  hasGivenUpWaitingForHost: boolean;
}

export type OnboardingPhase =
  | { kind: "welcome" }
  | { kind: "connecting" }
  | { kind: "picker" }
  | { kind: "error"; reason: string };

// Derives onboarding's local-connection capability at the platform boundary before pure phase policy runs.
export function resolveOnboardingPlatformCapability(
  input: ResolveOnboardingPlatformCapabilityInput,
): OnboardingPlatformCapability {
  if (input.isDesktopLocalRuntime) {
    return { kind: "desktop-local" };
  }
  if (input.hasLocalDaemonCandidate) {
    return { kind: "local-candidate" };
  }
  return { kind: "remote-only" };
}

// Determines which onboarding surface should render from persisted welcome state and runtime truth.
export function resolveOnboardingPhase(input: ResolveOnboardingPhaseInput): OnboardingPhase {
  if (!input.hasSeenWelcome) {
    return { kind: "welcome" };
  }

  if (input.userRequestedRemote || input.platformCapability.kind === "remote-only") {
    return { kind: "picker" };
  }

  if (input.localConnect.kind === "failed") {
    if (input.platformCapability.kind === "local-candidate") {
      return { kind: "picker" };
    }
    return { kind: "error", reason: input.localConnect.reason };
  }

  return { kind: "connecting" };
}

// Collapses daemon bootstrap and host-runtime snapshots into the local-connect state onboarding renders.
export function resolveOnboardingLocalConnectState(
  input: ResolveOnboardingLocalConnectStateInput,
): OnboardingLocalConnectState {
  if (input.startupBlockerKind === "managed-daemon-starting") {
    return { kind: "connecting" };
  }

  const connectedHost = input.hostSnapshots.find(
    (snapshot) => snapshot.connectionStatus === "online",
  );
  if (connectedHost) {
    return { kind: "idle" };
  }

  const pendingHost = input.hostSnapshots.find(
    (snapshot) =>
      snapshot.connectionStatus === "connecting" || snapshot.connectionStatus === "idle",
  );
  if (pendingHost) {
    return { kind: "connecting" };
  }

  const failedHost = input.hostSnapshots.find((snapshot) => snapshot.connectionStatus === "error");
  if (failedHost) {
    return {
      kind: "failed",
      reason: failedHost.lastError ?? LOCAL_DAEMON_TIMEOUT_REASON,
    };
  }

  if (input.splashError) {
    return { kind: "failed", reason: input.splashError };
  }

  if (input.hasGivenUpWaitingForHost) {
    return { kind: "failed", reason: LOCAL_DAEMON_TIMEOUT_REASON };
  }

  return { kind: "idle" };
}

export type StartupBlocker =
  | { kind: "none" }
  | { kind: "managed-daemon-starting" }
  | { kind: "managed-daemon-error"; message: string };

export interface ResolveStartupBlockerInput {
  isDesktopRuntime: boolean;
  anyOnlineHostServerId: string | null;
  daemonStartIsRunning: boolean;
  daemonStartError: string | null;
}

// Keeps startup surfaces blocked only for desktop daemon startup states that need user-visible gating.
export function resolveStartupBlocker(input: ResolveStartupBlockerInput): StartupBlocker {
  if (!input.isDesktopRuntime) {
    return { kind: "none" };
  }

  if (input.anyOnlineHostServerId) {
    return { kind: "none" };
  }

  if (input.daemonStartError) {
    return { kind: "managed-daemon-error", message: input.daemonStartError };
  }

  if (input.daemonStartIsRunning) {
    return { kind: "managed-daemon-starting" };
  }

  return { kind: "none" };
}

// Allows navigation once startup no longer needs the blocking splash surface.
export function resolveStartupNavigationReady(input: { startupBlocker: StartupBlocker }): boolean {
  return input.startupBlocker.kind !== "managed-daemon-starting";
}

// Runs the no-host give-up timer only when startup is otherwise idle and still has no online host.
export function shouldRunStartupGiveUpTimer(input: {
  startupBlocker: StartupBlocker;
  anyOnlineHostServerId: string | null;
  hasGivenUpWaitingForHost: boolean;
}): boolean {
  if (input.anyOnlineHostServerId) {
    return false;
  }
  if (input.hasGivenUpWaitingForHost) {
    return false;
  }
  return input.startupBlocker.kind === "none";
}

export type StartupRegistryStatus = "loading" | "ready";

export interface IndexStartupRouteTarget {
  kind: "index";
  pathname: string;
}

export interface HostStartupRouteTarget {
  kind: "host";
  serverId: string | null;
}

export interface WelcomeStartupRouteTarget {
  kind: "welcome";
}

export type StartupRouteTarget =
  | IndexStartupRouteTarget
  | HostStartupRouteTarget
  | WelcomeStartupRouteTarget;

interface ResolveStartupRouteBaseInput {
  startupBlocker: StartupBlocker;
  hostRegistryStatus: StartupRegistryStatus;
  hosts: readonly { serverId: string }[];
}

export interface ResolveIndexStartupRouteInput extends ResolveStartupRouteBaseInput {
  route: IndexStartupRouteTarget;
  anyOnlineHostServerId: string | null;
  workspaceSelection: ActiveWorkspaceSelection | null;
  isWorkspaceSelectionLoaded: boolean;
  hasGivenUpWaitingForHost: boolean;
  hasSeenWelcome: boolean;
}

export interface ResolveHostStartupRouteInput extends ResolveStartupRouteBaseInput {
  route: HostStartupRouteTarget;
}

export interface ResolveWelcomeStartupRouteInput extends ResolveStartupRouteBaseInput {
  route: WelcomeStartupRouteTarget;
  anyOnlineHostServerId: string | null;
  workspaceSelection: ActiveWorkspaceSelection | null;
  isWorkspaceSelectionLoaded: boolean;
}

export type ResolveStartupRouteInput =
  | ResolveIndexStartupRouteInput
  | ResolveHostStartupRouteInput
  | ResolveWelcomeStartupRouteInput;

export type StartupRouteDecision =
  | { kind: "render" }
  | { kind: "splash" }
  | { kind: "redirect"; href: Href };

// Identifies root pathnames so non-root routes can stay outside startup routing policy.
function isIndexPathname(pathname: string) {
  return pathname === "/" || pathname === "";
}

// Checks saved host existence without treating empty route params as real hosts.
function hostExists(hosts: readonly { serverId: string }[], serverId: string | null): boolean {
  if (!serverId) {
    return false;
  }
  return hosts.some((host) => host.serverId === serverId);
}

// Resolves root startup to saved workspaces, saved hosts, onboarding, or splash in that priority order.
function resolveReadyIndexStartupRoute(input: ResolveIndexStartupRouteInput): StartupRouteDecision {
  if (!isIndexPathname(input.route.pathname)) {
    return { kind: "render" };
  }

  if (!input.isWorkspaceSelectionLoaded) {
    return { kind: "splash" };
  }

  const workspaceSelection = input.workspaceSelection;
  if (workspaceSelection && hostExists(input.hosts, workspaceSelection.serverId)) {
    return {
      kind: "redirect",
      href: buildHostWorkspaceRoute(workspaceSelection.serverId, workspaceSelection.workspaceId),
    };
  }

  if (input.anyOnlineHostServerId) {
    return { kind: "redirect", href: buildHostRootRoute(input.anyOnlineHostServerId) };
  }

  const savedHostServerId = input.hosts[0]?.serverId ?? null;
  if (savedHostServerId) {
    return { kind: "redirect", href: buildHostRootRoute(savedHostServerId) };
  }

  if (!input.hasSeenWelcome) {
    return { kind: "redirect", href: WELCOME_ROUTE };
  }

  if (input.hasGivenUpWaitingForHost || input.startupBlocker.kind === "managed-daemon-error") {
    return { kind: "redirect", href: WELCOME_ROUTE };
  }

  return { kind: "splash" };
}

// Keeps host routes mounted when possible and otherwise falls back to a valid host or onboarding.
function resolveReadyHostStartupRoute(input: ResolveHostStartupRouteInput): StartupRouteDecision {
  if (hostExists(input.hosts, input.route.serverId)) {
    return { kind: "render" };
  }

  const fallbackServerId = input.hosts[0]?.serverId ?? null;
  if (fallbackServerId) {
    return { kind: "redirect", href: buildHostOpenProjectRoute(fallbackServerId) };
  }

  return { kind: "redirect", href: WELCOME_ROUTE };
}

// Lets the onboarding route yield to the same persisted host landing policy without owning it in UI.
function resolveReadyWelcomeStartupRoute(
  input: ResolveWelcomeStartupRouteInput,
): StartupRouteDecision {
  if (!input.isWorkspaceSelectionLoaded) {
    return { kind: "render" };
  }

  const workspaceSelection = input.workspaceSelection;
  if (workspaceSelection && hostExists(input.hosts, workspaceSelection.serverId)) {
    return {
      kind: "redirect",
      href: buildHostWorkspaceRoute(workspaceSelection.serverId, workspaceSelection.workspaceId),
    };
  }

  if (input.anyOnlineHostServerId) {
    return { kind: "redirect", href: buildHostRootRoute(input.anyOnlineHostServerId) };
  }

  const savedHostServerId = input.hosts[0]?.serverId ?? null;
  if (savedHostServerId) {
    return { kind: "redirect", href: buildHostRootRoute(savedHostServerId) };
  }

  return { kind: "render" };
}

// Narrows the startup route input so host routes can preserve their mounted shell during loading.
function isHostStartupRouteInput(
  input: ResolveStartupRouteInput,
): input is ResolveHostStartupRouteInput {
  return input.route.kind === "host";
}

// Narrows startup route input for the onboarding shell so it can reuse landing policy.
function isWelcomeStartupRouteInput(
  input: ResolveStartupRouteInput,
): input is ResolveWelcomeStartupRouteInput {
  return input.route.kind === "welcome";
}

// Resolves startup routing from already-hydrated snapshots so components do not own navigation policy.
export function resolveStartupRoute(input: ResolveStartupRouteInput): StartupRouteDecision {
  if (isHostStartupRouteInput(input)) {
    if (
      input.startupBlocker.kind === "managed-daemon-starting" ||
      input.hostRegistryStatus === "loading"
    ) {
      return { kind: "render" };
    }
    return resolveReadyHostStartupRoute(input);
  }

  if (isWelcomeStartupRouteInput(input)) {
    if (input.hostRegistryStatus === "loading") {
      return { kind: "render" };
    }
    return resolveReadyWelcomeStartupRoute(input);
  }

  if (input.startupBlocker.kind === "managed-daemon-starting") {
    return { kind: "splash" };
  }

  if (input.hostRegistryStatus === "loading") {
    return { kind: "splash" };
  }

  return resolveReadyIndexStartupRoute(input);
}
