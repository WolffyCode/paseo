import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { getE2EDaemonPort } from "./helpers/daemon-port";

const DESKTOP_DAEMON_MODE_KEY = "@paseo:e2e-onboarding-desktop-daemon-mode";
const DISABLE_DEFAULT_SEED_ONCE_KEY = "@paseo:e2e-disable-default-seed-once";
const E2E_KEY = "@paseo:e2e";
const ONBOARDING_STORE_KEY = "onboarding";
const REGISTRY_KEY = "@paseo:daemon-registry";
const SEED_NONCE_KEY = "@paseo:e2e-seed-nonce";
const STORAGE_SEED_HTML = "<!doctype html><html><body>onboarding storage seed</body></html>";

declare global {
  interface Window {
    __onboardingDesktopDaemonMode?: "idle" | "success" | "failure" | "pending";
  }
}

// Opens a same-origin seed page so the next app navigation can start without the default saved host.
async function prepareFreshOnboardingStorage(page: Page): Promise<void> {
  await page.route(
    "**/*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: STORAGE_SEED_HTML,
      });
    },
    { times: 1 },
  );
  await page.goto("/");
  await page.evaluate(
    ({ disableDefaultSeedOnceKey, e2eKey, onboardingStoreKey, registryKey, seedNonceKey }) => {
      const nonce = localStorage.getItem(seedNonceKey);
      if (!nonce) {
        throw new Error("Expected the E2E fixture seed nonce before clearing onboarding storage.");
      }

      localStorage.setItem(e2eKey, "1");
      localStorage.setItem(disableDefaultSeedOnceKey, nonce);
      localStorage.setItem(registryKey, JSON.stringify([]));
      localStorage.removeItem(onboardingStoreKey);
    },
    {
      disableDefaultSeedOnceKey: DISABLE_DEFAULT_SEED_ONCE_KEY,
      e2eKey: E2E_KEY,
      onboardingStoreKey: ONBOARDING_STORE_KEY,
      registryKey: REGISTRY_KEY,
      seedNonceKey: SEED_NONCE_KEY,
    },
  );
}

// Installs a desktop bridge whose daemon start mode can be enabled after the welcome renders.
// The mode is sourced from localStorage so it survives a reopen (reload), letting the boot-time
// self-heal connection observe the intended outcome before any click.
async function installDesktopOnboardingBridge(page: Page): Promise<void> {
  await page.addInitScript(
    ({ daemonPort, modeKey }) => {
      const persistedMode = localStorage.getItem(modeKey);
      window.__onboardingDesktopDaemonMode =
        persistedMode === "success" || persistedMode === "failure" || persistedMode === "pending"
          ? persistedMode
          : "idle";
      const delayStartup = () => new Promise((resolve) => setTimeout(resolve, 1_000));
      const status = {
        serverId: "srv_onboarding_local",
        status: "running",
        listen: `127.0.0.1:${daemonPort}`,
        hostname: "localhost",
        pid: 12345,
        home: "",
        version: null,
        desktopManaged: true,
        error: null,
      };

      window.paseoDesktop = {
        platform: "darwin",
        invoke: async (command: string) => {
          if (command === "get_desktop_settings") {
            return {
              releaseChannel: "stable",
              daemon: {
                manageBuiltInDaemon: window.__onboardingDesktopDaemonMode !== "idle",
                keepRunningAfterQuit: true,
              },
            };
          }
          if (command === "start_desktop_daemon") {
            if (window.__onboardingDesktopDaemonMode === "pending") {
              // Never resolve: keeps the managed daemon in its starting phase so the
              // connecting surface stays stable for cancel / defer assertions.
              await new Promise(() => {});
            }
            await delayStartup();
            if (window.__onboardingDesktopDaemonMode === "failure") {
              throw new Error("onboarding daemon failed");
            }
            return status;
          }
          if (command === "desktop_daemon_status") {
            if (window.__onboardingDesktopDaemonMode === "failure") {
              return {
                serverId: "srv_onboarding_failed",
                status: "errored",
                listen: null,
                hostname: null,
                pid: null,
                home: "",
                version: null,
                desktopManaged: true,
                error: "onboarding daemon failed",
              };
            }
            if (window.__onboardingDesktopDaemonMode === "pending") {
              return {
                serverId: "srv_onboarding_local",
                status: "starting",
                listen: null,
                hostname: null,
                pid: null,
                home: "",
                version: null,
                desktopManaged: true,
                error: null,
              };
            }
            return status;
          }
          if (command === "desktop_daemon_logs") {
            return { logPath: "", contents: "" };
          }
          return null;
        },
        getPendingOpenProject: async () => null,
        events: { on: async () => () => undefined },
      };
    },
    { daemonPort: getE2EDaemonPort(), modeKey: DESKTOP_DAEMON_MODE_KEY },
  );
}

// Sets the desktop bridge's daemon start outcome, persisting it so a reopen (reload) keeps it.
async function setDesktopDaemonMode(
  page: Page,
  mode: NonNullable<Window["__onboardingDesktopDaemonMode"]>,
): Promise<void> {
  await page.evaluate(
    ({ nextMode, modeKey }) => {
      window.__onboardingDesktopDaemonMode = nextMode;
      localStorage.setItem(modeKey, nextMode);
    },
    { nextMode: mode, modeKey: DESKTOP_DAEMON_MODE_KEY },
  );
}

// Re-navigates the app as a "reopen" while keeping no-host storage and re-arming the seed-disable
// flag, so the fixture's per-navigation default host re-seed does not masquerade as a saved host.
async function reopenFreshDesktopApp(page: Page): Promise<void> {
  await page.evaluate(
    ({ disableDefaultSeedOnceKey, e2eKey, registryKey, seedNonceKey }) => {
      const nonce = localStorage.getItem(seedNonceKey);
      if (!nonce) {
        throw new Error("Expected the E2E fixture seed nonce before reopening the app.");
      }
      localStorage.setItem(e2eKey, "1");
      localStorage.setItem(disableDefaultSeedOnceKey, nonce);
      localStorage.setItem(registryKey, JSON.stringify([]));
    },
    {
      disableDefaultSeedOnceKey: DISABLE_DEFAULT_SEED_ONCE_KEY,
      e2eKey: E2E_KEY,
      registryKey: REGISTRY_KEY,
      seedNonceKey: SEED_NONCE_KEY,
    },
  );
  await page.goto("/");
}

// Marks the one-time welcome as seen for tests that need the no-host picker route directly.
async function markWelcomeSeen(page: Page): Promise<void> {
  await page.evaluate((onboardingStoreKey) => {
    localStorage.setItem(
      onboardingStoreKey,
      JSON.stringify({
        state: { hasSeenWelcome: true },
        version: 0,
      }),
    );
  }, ONBOARDING_STORE_KEY);
}

// Opens a fresh no-host app after marking the welcome flag as already seen and waits for picker fallback.
async function openFreshSeenWelcomeOnboarding(page: Page): Promise<void> {
  await prepareFreshOnboardingStorage(page);
  await markWelcomeSeen(page);
  await page.goto("/");
  await expect(page.getByTestId("onboarding-method-picker")).toBeVisible({ timeout: 30_000 });
}

// Clicks a button only after setting the desktop daemon mode used by the injected bridge.
async function clickWithDesktopDaemonMode(
  page: Page,
  testId: string,
  mode: NonNullable<Window["__onboardingDesktopDaemonMode"]>,
): Promise<void> {
  await setDesktopDaemonMode(page, mode);
  await page.getByTestId(testId).click();
}

// Opens the first-run welcome on a desktop-capable app without letting bootstrap pre-save a host.
async function openFreshDesktopWelcome(page: Page): Promise<void> {
  await installDesktopOnboardingBridge(page);
  await openFreshOnboarding(page);
}

// Opens a fresh first-run app with no saved host and no persisted welcome flag.
async function openFreshOnboarding(page: Page): Promise<void> {
  await prepareFreshOnboardingStorage(page);
  await page.goto("/");
  await expect(page.getByTestId("onboarding-welcome")).toBeVisible({ timeout: 30_000 });
}

// Opens a fresh browser-only first-run app with no local daemon bridge.
async function openFreshBrowserWelcome(page: Page): Promise<void> {
  await openFreshOnboarding(page);
}

test.describe("Onboarding", () => {
  test("first run starts local connection and lands in the app shell when the daemon is reachable", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await expect(page.getByTestId("sidebar-settings")).toHaveCount(0);
    await clickWithDesktopDaemonMode(page, "onboarding-start", "success");
    await expect(page.getByTestId("onboarding-connecting")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/h\/srv_onboarding_local(\/|$)/, { timeout: 30_000 });
  });

  test("remote connection link opens the method picker with all desktop methods", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await page.getByTestId("onboarding-connect-remote").click();

    await expect(page.getByTestId("onboarding-method-picker")).toBeVisible();
    await expect(page.getByTestId("onboarding-direct-connection")).toBeVisible();
    await expect(page.getByTestId("onboarding-paste-pairing-link")).toBeVisible();
    await expect(page.getByTestId("onboarding-scan-qr")).toBeVisible();
    await expect(page.getByTestId("onboarding-picker-retry-local")).toBeVisible();
  });

  test("local failure shows retry, alternate methods, and diagnostics recovery actions", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await clickWithDesktopDaemonMode(page, "onboarding-start", "failure");
    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });

    await clickWithDesktopDaemonMode(page, "onboarding-error-retry-local", "failure");
    await expect(page.getByTestId("onboarding-connecting")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("onboarding-use-other-methods").click();
    await expect(page.getByTestId("onboarding-method-picker")).toBeVisible();

    await clickWithDesktopDaemonMode(page, "onboarding-picker-retry-local", "failure");
    await expect(page.getByTestId("onboarding-connecting")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("onboarding-open-diagnostics").click();
    await expect(page).toHaveURL(/\/settings(\/|$)/);
  });

  test("web first run attempts local connection before picker fallback without scan", async ({
    page,
  }) => {
    await openFreshBrowserWelcome(page);

    await page.getByTestId("onboarding-start").click();

    await expect(page.getByTestId("onboarding-connecting")).toBeVisible();
    await expect(page.getByTestId("onboarding-method-picker")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("onboarding-direct-connection")).toBeVisible();
    await expect(page.getByTestId("onboarding-paste-pairing-link")).toBeVisible();
    await expect(page.getByTestId("onboarding-picker-retry-local")).toBeVisible();
    await expect(page.getByTestId("onboarding-scan-qr")).toHaveCount(0);
  });

  test("already-seen web startup falls back to the no-host picker without the scan option", async ({
    page,
  }) => {
    await openFreshSeenWelcomeOnboarding(page);

    await expect(page.getByTestId("onboarding-direct-connection")).toBeVisible();
    await expect(page.getByTestId("onboarding-paste-pairing-link")).toBeVisible();
    await expect(page.getByTestId("onboarding-picker-retry-local")).toBeVisible();
    await expect(page.getByTestId("onboarding-scan-qr")).toHaveCount(0);
  });

  // Acceptance #12 (defer connection, core bug regression): a genuine first run must stay on the
  // welcome and never connect before "Get started" — even when the local daemon would come online
  // immediately at boot. The mode is armed to "success" BEFORE boot so that if the defer guard were
  // broken, the eager boot connect would start the daemon and redirect the welcome away to home.
  // (Verified to have teeth via a mutation that removed the defer guard — without arming-before-boot
  // the assertion is vacuous because the boot connect attempt runs before any post-mount mode set.)
  test("desktop first run stays on the welcome and does not connect before Get started", async ({
    page,
  }) => {
    await installDesktopOnboardingBridge(page);
    await prepareFreshOnboardingStorage(page);
    // Arm the managed daemon to come online at boot *if* anything triggers it.
    await page.evaluate(
      (modeKey) => localStorage.setItem(modeKey, "success"),
      DESKTOP_DAEMON_MODE_KEY,
    );
    await page.goto("/");
    await expect(page.getByTestId("onboarding-welcome")).toBeVisible({ timeout: 30_000 });

    // Give boot ample time to (incorrectly) eager-connect and redirect, then prove it did not.
    await page.waitForTimeout(3_000);

    await expect(page.getByTestId("onboarding-welcome")).toBeVisible();
    await expect(page.getByTestId("onboarding-connecting")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/h\/srv_onboarding_local(\/|$)/);
    const registryRaw = await page.evaluate(() => localStorage.getItem("@paseo:daemon-registry"));
    expect(registryRaw).toBe("[]");
  });

  // Acceptance #12 (defer, web variant): a fresh browser first run shows the welcome and does not
  // auto-advance to a connecting/picker surface without a click — no background pre-welcome connect.
  test("web first run stays on the welcome with no background connection before Get started", async ({
    page,
  }) => {
    await openFreshBrowserWelcome(page);

    await page.waitForTimeout(3_000);

    await expect(page.getByTestId("onboarding-welcome")).toBeVisible();
    await expect(page.getByTestId("onboarding-connecting")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-method-picker")).toHaveCount(0);
  });

  // Acceptance #13 (reopen self-heal): first run fails to connect → lands on the picker/error; on
  // reopen with the daemon now reachable, boot silently self-heals straight to home WITHOUT
  // re-showing the welcome. This exercises the fatal hydration path (returning user → boot connects).
  test("desktop reopen self-heals into the app shell without re-showing the welcome", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await clickWithDesktopDaemonMode(page, "onboarding-start", "failure");
    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });

    // Reopen the app (welcome already seen) with the daemon now reachable.
    await setDesktopDaemonMode(page, "success");
    await reopenFreshDesktopApp(page);

    await expect(page).toHaveURL(/\/h\/srv_onboarding_local(\/|$)/, { timeout: 30_000 });
    await expect(page.getByTestId("onboarding-welcome")).toHaveCount(0);
  });

  // Acceptance #13 (reopen self-heal, still unreachable): reopen while the daemon is still down
  // returns to the desktop error surface and never re-shows the one-time welcome.
  test("desktop reopen with the daemon still down returns to the error surface without the welcome", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await clickWithDesktopDaemonMode(page, "onboarding-start", "failure");
    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });

    await setDesktopDaemonMode(page, "failure");
    await reopenFreshDesktopApp(page);

    await expect(page.getByTestId("onboarding-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("onboarding-welcome")).toHaveCount(0);
  });

  // Acceptance flow (S2 cancel): cancelling the connecting surface lands on the method picker,
  // never back on the one-time welcome. Pending mode holds the connecting surface stable.
  test("cancelling the connecting surface lands on the picker, not the welcome", async ({
    page,
  }) => {
    await openFreshDesktopWelcome(page);

    await clickWithDesktopDaemonMode(page, "onboarding-start", "pending");
    await expect(page.getByTestId("onboarding-connecting")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("onboarding-cancel-local").click();

    await expect(page.getByTestId("onboarding-method-picker")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("onboarding-welcome")).toHaveCount(0);
  });
});
