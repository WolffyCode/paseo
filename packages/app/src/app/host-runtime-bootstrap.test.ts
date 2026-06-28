import { describe, expect, it, vi } from "vitest";
import {
  connectLocalOnBoot,
  type ResolveIndexStartupRouteInput,
  resolveOnboardingLocalConnectState,
  resolveOnboardingPhase,
  resolveOnboardingPlatformCapability,
  resolveStartupBlocker,
  resolveStartupNavigationReady,
  resolveStartupRoute,
  shouldRunStartupGiveUpTimer,
  startDaemonIfGateAllows,
  startHostRuntimeBootstrap,
} from "./host-runtime-bootstrap";

function createFakeStore() {
  return { boot: vi.fn() };
}

function createFakeDaemonStartService() {
  return {
    start: vi.fn(async () => ({ ok: true as const })),
  };
}

describe("startHostRuntimeBootstrap", () => {
  it("loads the host registry at mount without forcing a connection decision", () => {
    const store = createFakeStore();

    startHostRuntimeBootstrap({ store });

    expect(store.boot).toHaveBeenCalledTimes(1);
  });
});

describe("startDaemonIfGateAllows", () => {
  it("starts the desktop daemon without awaiting the daemon-start promise", () => {
    const events: string[] = [];
    const daemonStartService = {
      start: vi.fn(async () => {
        events.push("daemon-start");
        return { ok: true as const };
      }),
    };

    startDaemonIfGateAllows({ daemonStartService, shouldStartDaemon: true });

    expect(daemonStartService.start).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["daemon-start"]);
  });

  it("skips daemon-start when shouldStartDaemon is false", () => {
    const daemonStartService = createFakeDaemonStartService();

    startDaemonIfGateAllows({ daemonStartService, shouldStartDaemon: false });

    expect(daemonStartService.start).not.toHaveBeenCalled();
  });

  it("skips daemon-start when the startup gate resolves false", async () => {
    const daemonStartService = createFakeDaemonStartService();

    startDaemonIfGateAllows({ daemonStartService, shouldStartDaemon: async () => false });
    await Promise.resolve();

    expect(daemonStartService.start).not.toHaveBeenCalled();
  });

  it("surfaces gate rejection to onGateError without starting the daemon", async () => {
    const daemonStartService = createFakeDaemonStartService();
    const onGateError = vi.fn();

    startDaemonIfGateAllows({
      daemonStartService,
      shouldStartDaemon: async () => {
        throw new Error("settings file unreadable");
      },
      onGateError,
    });
    await vi.waitFor(() => {
      expect(onGateError).toHaveBeenCalledTimes(1);
    });

    expect(daemonStartService.start).not.toHaveBeenCalled();
    expect(onGateError).toHaveBeenCalledWith(expect.stringContaining("settings file unreadable"));
  });

  it("does not await the daemon-start promise", () => {
    let resolveStart: ((value: { ok: true }) => void) | undefined;
    const daemonStartService = {
      start: vi.fn(
        () =>
          new Promise<{ ok: true }>((resolve) => {
            resolveStart = resolve;
          }),
      ),
    };

    startDaemonIfGateAllows({ daemonStartService, shouldStartDaemon: true });

    expect(daemonStartService.start).toHaveBeenCalledTimes(1);

    resolveStart?.({ ok: true });
  });
});

describe("connectLocalOnBoot", () => {
  it("defers local connection on a genuine first run so the welcome cannot be skipped", () => {
    const connectLocal = vi.fn();

    connectLocalOnBoot({ hasSeenWelcome: false, connectLocal });

    expect(connectLocal).not.toHaveBeenCalled();
  });

  it("eagerly self-heals the local connection once the welcome has been seen", () => {
    const connectLocal = vi.fn();

    connectLocalOnBoot({ hasSeenWelcome: true, connectLocal });

    expect(connectLocal).toHaveBeenCalledTimes(1);
  });
});

describe("startup blocking policy", () => {
  const noBlockerInput = {
    isDesktopRuntime: false,
    anyOnlineHostServerId: null,
    daemonStartIsRunning: false,
    daemonStartError: null,
  };

  it("runs the give-up timer when no startup blocker is active", () => {
    const blocker = resolveStartupBlocker(noBlockerInput);

    expect(blocker).toEqual({ kind: "none" });
    expect(resolveStartupNavigationReady({ startupBlocker: blocker })).toBe(true);
    expect(
      shouldRunStartupGiveUpTimer({
        startupBlocker: blocker,
        anyOnlineHostServerId: null,
        hasGivenUpWaitingForHost: false,
      }),
    ).toBe(true);
  });

  it("blocks navigation while desktop is starting the managed daemon", () => {
    const blocker = resolveStartupBlocker({
      ...noBlockerInput,
      isDesktopRuntime: true,
      daemonStartIsRunning: true,
    });

    expect(blocker).toEqual({ kind: "managed-daemon-starting" });
    expect(resolveStartupNavigationReady({ startupBlocker: blocker })).toBe(false);
    expect(
      shouldRunStartupGiveUpTimer({
        startupBlocker: blocker,
        anyOnlineHostServerId: null,
        hasGivenUpWaitingForHost: false,
      }),
    ).toBe(false);
  });

  it("unblocks navigation when any host is online", () => {
    const blocker = resolveStartupBlocker({
      ...noBlockerInput,
      isDesktopRuntime: true,
      anyOnlineHostServerId: "srv_desktop",
      daemonStartIsRunning: true,
    });

    expect(blocker).toEqual({ kind: "none" });
    expect(resolveStartupNavigationReady({ startupBlocker: blocker })).toBe(true);
  });

  it("keeps desktop daemon startup errors navigable so onboarding can show local recovery actions", () => {
    const blocker = resolveStartupBlocker({
      ...noBlockerInput,
      isDesktopRuntime: true,
      daemonStartError: "daemon failed to start",
    });

    expect(blocker).toEqual({
      kind: "managed-daemon-error",
      message: "daemon failed to start",
    });
    expect(resolveStartupNavigationReady({ startupBlocker: blocker })).toBe(true);
    expect(
      shouldRunStartupGiveUpTimer({
        startupBlocker: blocker,
        anyOnlineHostServerId: null,
        hasGivenUpWaitingForHost: false,
      }),
    ).toBe(false);
  });
});

describe("resolveOnboardingPhase", () => {
  it("shows the one-time welcome on desktop before the user has seen it", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: false,
        platformCapability: { kind: "desktop-local" },
        localConnect: { kind: "idle" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "welcome" });
  });

  it("starts the desktop local connection after the welcome has been seen", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "desktop-local" },
        localConnect: { kind: "idle" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("keeps desktop startup on the connecting phase while local connection is active", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "desktop-local" },
        localConnect: { kind: "connecting" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("shows the desktop local connection error and preserves the raw reason for diagnostics", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "desktop-local" },
        localConnect: { kind: "failed", reason: "port already in use" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "error", reason: "port already in use" });
  });

  it("honors the user's remote-connection intent over desktop local connection state", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "desktop-local" },
        localConnect: { kind: "failed", reason: "timeout" },
        userRequestedRemote: true,
      }),
    ).toEqual({ kind: "picker" });
  });

  it("keeps the one-time welcome on local-candidate platforms before automatic local connection", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: false,
        platformCapability: { kind: "local-candidate" },
        localConnect: { kind: "idle" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "welcome" });
  });

  it("starts the local-candidate automatic connection after the welcome has been seen", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "local-candidate" },
        localConnect: { kind: "idle" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("keeps local-candidate startup on the connecting phase while probing is active", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "local-candidate" },
        localConnect: { kind: "connecting" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("falls back to the picker when a local-candidate probe fails", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "local-candidate" },
        localConnect: { kind: "failed", reason: "connection timed out" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "picker" });
  });

  it("honors the user's remote-connection intent over local-candidate probing", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "local-candidate" },
        localConnect: { kind: "connecting" },
        userRequestedRemote: true,
      }),
    ).toEqual({ kind: "picker" });
  });

  it("keeps the one-time welcome on remote-only platforms before choosing a connection method", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: false,
        platformCapability: { kind: "remote-only" },
        localConnect: { kind: "idle" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "welcome" });
  });

  it("sends true remote-only platforms to the method picker after the welcome", () => {
    expect(
      resolveOnboardingPhase({
        hasSeenWelcome: true,
        platformCapability: { kind: "remote-only" },
        localConnect: { kind: "connecting" },
        userRequestedRemote: false,
      }),
    ).toEqual({ kind: "picker" });
  });
});

describe("resolveOnboardingPlatformCapability", () => {
  it("uses desktop-local when the desktop daemon runtime is available", () => {
    expect(
      resolveOnboardingPlatformCapability({
        isDesktopLocalRuntime: true,
        hasLocalDaemonCandidate: false,
      }),
    ).toEqual({ kind: "desktop-local" });
  });

  it("uses local-candidate for non-desktop runtimes with a boot-time local daemon candidate", () => {
    expect(
      resolveOnboardingPlatformCapability({
        isDesktopLocalRuntime: false,
        hasLocalDaemonCandidate: true,
      }),
    ).toEqual({ kind: "local-candidate" });
  });

  it("keeps remote-only as the explicit no-local-candidate fallback", () => {
    expect(
      resolveOnboardingPlatformCapability({
        isDesktopLocalRuntime: false,
        hasLocalDaemonCandidate: false,
      }),
    ).toEqual({ kind: "remote-only" });
  });
});

describe("resolveOnboardingLocalConnectState", () => {
  it("uses the managed-daemon-starting blocker as the connecting state before host snapshots settle", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [],
        splashError: null,
        startupBlockerKind: "managed-daemon-starting",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("treats an online host as idle because startup routing owns the landing redirect", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [{ connectionStatus: "online", lastError: null }],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: true,
      }),
    ).toEqual({ kind: "idle" });
  });

  it("keeps pending host snapshots in the connecting state", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [
          { connectionStatus: "offline", lastError: null },
          { connectionStatus: "connecting", lastError: null },
        ],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "connecting" });
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [{ connectionStatus: "idle", lastError: null }],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "connecting" });
  });

  it("preserves a host-runtime error reason for onboarding recovery details", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [{ connectionStatus: "error", lastError: "port already in use" }],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "failed", reason: "port already in use" });
  });

  it("falls back to the local timeout reason when a failed host has no raw error", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [{ connectionStatus: "error", lastError: null }],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "failed", reason: "Timed out waiting for the local daemon." });
  });

  it("moves managed-daemon-error from a splash dead end into onboarding recovery details", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [],
        splashError: "daemon failed to start",
        startupBlockerKind: "managed-daemon-error",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "failed", reason: "daemon failed to start" });
  });

  it("uses the timeout recovery state once startup has given up waiting for local hosts", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: true,
      }),
    ).toEqual({ kind: "failed", reason: "Timed out waiting for the local daemon." });
  });

  it("stays idle when there is no local connection signal yet", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "idle" });
  });

  it("treats offline-only host snapshots as idle until timeout or daemon errors provide recovery detail", () => {
    expect(
      resolveOnboardingLocalConnectState({
        hostSnapshots: [{ connectionStatus: "offline", lastError: null }],
        splashError: null,
        startupBlockerKind: "none",
        hasGivenUpWaitingForHost: false,
      }),
    ).toEqual({ kind: "idle" });
  });
});

describe("resolveStartupRoute", () => {
  const baseIndexInput = {
    route: { kind: "index" as const, pathname: "/" },
    startupBlocker: { kind: "none" as const },
    hostRegistryStatus: "ready" as const,
    hosts: [],
    anyOnlineHostServerId: null,
    isStartupStateHydrated: true,
    hasGivenUpWaitingForHost: false,
    hasSeenWelcome: true,
  };
  const baseHostInput = {
    route: { kind: "host" as const, serverId: "server-saved" },
    startupBlocker: { kind: "none" as const },
    hostRegistryStatus: "ready" as const,
    hosts: [],
  };

  it("renders non-index routes instead of making an index startup decision", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        route: { kind: "index", pathname: "/settings" },
      }),
    ).toEqual({ kind: "render" });
  });

  it("keeps startup on the splash until the welcome flag has hydrated", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        anyOnlineHostServerId: "server-1",
        isStartupStateHydrated: false,
      }),
    ).toEqual({ kind: "splash" });
  });

  it("lands a returning user on a fresh new conversation, never a restored workspace", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hosts: [{ serverId: "server-1" }],
        anyOnlineHostServerId: "server-1",
      }),
    ).toEqual({ kind: "redirect", href: "/h/server-1/new" });
  });

  it("keeps startup on the splash while the host registry is loading", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hostRegistryStatus: "loading",
      }),
    ).toEqual({ kind: "splash" });
  });

  it("lands on a fresh new conversation as soon as a host is online", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        anyOnlineHostServerId: "srv-desktop",
      }),
    ).toEqual({ kind: "redirect", href: "/h/srv-desktop/new" });
  });

  it("waits on the splash while a returning user is still connecting to a saved host", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hosts: [{ serverId: "server-saved" }],
      }),
    ).toEqual({ kind: "splash" });
  });

  it("shows the one-time welcome on a genuine first run before any host is live", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hasSeenWelcome: false,
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("never lets a saved-but-offline host suppress the first-run welcome", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hosts: [{ serverId: "server-saved" }],
        hasGivenUpWaitingForHost: true,
        hasSeenWelcome: false,
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("routes an empty root startup to onboarding recovery after waiting for local hosts", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        hasGivenUpWaitingForHost: true,
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("routes managed-daemon-error from the old splash dead end into onboarding recovery when no host can land", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        startupBlocker: { kind: "managed-daemon-error", message: "port in use" },
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("keeps host routes mounted while the host registry is loading", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        hostRegistryStatus: "loading",
      }),
    ).toEqual({ kind: "render" });
  });

  it("keeps host routes mounted while the managed daemon is starting", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        startupBlocker: { kind: "managed-daemon-starting" },
      }),
    ).toEqual({ kind: "render" });
  });

  it("lets host routes fall back to onboarding when the managed daemon reports a startup error", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        startupBlocker: { kind: "managed-daemon-error", message: "port in use" },
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("renders a host route once the route host is known", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        hosts: [{ serverId: "server-saved" }],
      }),
    ).toEqual({ kind: "render" });
  });

  it("sends removed host routes to a saved host's new conversation instead of welcome", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        route: { kind: "host", serverId: "server-removed" },
        hosts: [{ serverId: "server-next" }],
      }),
    ).toEqual({ kind: "redirect", href: "/h/server-next/new" });
  });

  it("shows welcome from a host route only after the registry proves no hosts exist", () => {
    expect(
      resolveStartupRoute({
        ...baseHostInput,
        route: { kind: "host", serverId: "server-removed" },
      }),
    ).toEqual({ kind: "redirect", href: "/welcome" });
  });

  it("lets an online host land home even before the welcome flag was seen", () => {
    expect(
      resolveStartupRoute({
        ...baseIndexInput,
        anyOnlineHostServerId: "srv-online",
        hasGivenUpWaitingForHost: true,
        hasSeenWelcome: false,
      }),
    ).toEqual({ kind: "redirect", href: "/h/srv-online/new" });
  });

  it("lands the onboarding route on a fresh new conversation once a host is online", () => {
    expect(
      resolveStartupRoute({
        route: { kind: "welcome" },
        startupBlocker: { kind: "none" },
        hostRegistryStatus: "ready",
        hosts: [{ serverId: "server-1" }],
        anyOnlineHostServerId: "server-1",
      }),
    ).toEqual({ kind: "redirect", href: "/h/server-1/new" });
  });

  it("renders the onboarding route while a saved host is still connecting", () => {
    expect(
      resolveStartupRoute({
        route: { kind: "welcome" },
        startupBlocker: { kind: "none" },
        hostRegistryStatus: "ready",
        hosts: [{ serverId: "server-1" }],
        anyOnlineHostServerId: null,
      }),
    ).toEqual({ kind: "render" });
  });

  it("renders the onboarding route when startup has no host landing target", () => {
    expect(
      resolveStartupRoute({
        route: { kind: "welcome" },
        startupBlocker: { kind: "managed-daemon-error", message: "port in use" },
        hostRegistryStatus: "ready",
        hosts: [],
        anyOnlineHostServerId: null,
      }),
    ).toEqual({ kind: "render" });
  });
});

describe("index cold-start mount contract", () => {
  // The root index screen renders ONLY a <Redirect> or the connecting splash — never arbitrary
  // page content — so it can never strand a screen alongside the freshly-seeded host shell. This
  // locks the invariant index.tsx leans on: for the root pathname resolveStartupRoute always lands
  // on "redirect" or "splash" across the whole hydration / host / blocker matrix, never "render".
  const rootInput: ResolveIndexStartupRouteInput = {
    route: { kind: "index", pathname: "/" },
    startupBlocker: { kind: "none" },
    hostRegistryStatus: "ready",
    hosts: [],
    anyOnlineHostServerId: null,
    isStartupStateHydrated: true,
    hasGivenUpWaitingForHost: false,
    hasSeenWelcome: true,
  };

  const matrix: Array<Partial<ResolveIndexStartupRouteInput>> = [
    {},
    { isStartupStateHydrated: false },
    { hostRegistryStatus: "loading" },
    { anyOnlineHostServerId: "srv-online" },
    { hasSeenWelcome: false },
    { hasGivenUpWaitingForHost: true },
    { startupBlocker: { kind: "managed-daemon-starting" } },
    { startupBlocker: { kind: "managed-daemon-error", message: "boom" } },
    { hosts: [{ serverId: "srv-saved" }] },
    { hosts: [{ serverId: "srv-saved" }], anyOnlineHostServerId: "srv-saved" },
  ];

  it.each(matrix)("never resolves the root route to a stranding render (%o)", (override) => {
    const decision = resolveStartupRoute({ ...rootInput, ...override });

    expect(decision.kind).not.toBe("render");
    expect(["redirect", "splash"]).toContain(decision.kind);
  });

  it("waits on the splash while hydrating, then redirects in one step once a host is online", () => {
    expect(resolveStartupRoute({ ...rootInput, isStartupStateHydrated: false })).toEqual({
      kind: "splash",
    });
    expect(resolveStartupRoute({ ...rootInput, anyOnlineHostServerId: "srv-online" })).toEqual({
      kind: "redirect",
      href: "/h/srv-online/new",
    });
  });
});
