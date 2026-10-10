import {
  PLUGIN_PLATFORM_API_VERSION,
  type PlatformService,
} from "@getpaseo/protocol/plugin-platform";
import type { PlatformHostCapabilities } from "@getpaseo/protocol/plugin-platform-execution";
import { executionError } from "./execution-errors.js";
import {
  loadPlatformPackage,
  type LoadedPlatformPackage,
  type PlatformPackageInput,
} from "./package.js";

export const PLATFORM_HOST_CAPABILITIES: PlatformHostCapabilities = {
  apiVersion: PLUGIN_PLATFORM_API_VERSION,
  runtimes: ["daemon"],
  providerScopes: ["host"],
  targets: ["service"],
  retryPolicies: ["read", "no-replay"],
  callers: ["session"],
  limits: {
    deadlineMs: 30_000,
    maxCallDepth: 16,
    maxBindingsPerSession: 256,
    maxActiveCalls: 256,
  },
};
// The broker's own deadline settles a call first; this only bounds a worker that never replies.
export const PLATFORM_WORKER_REPLY_GRACE_MS = 5_000;

/** Rejects contracts whose members need capabilities this host does not execute yet. */
function assertExecutableService(service: PlatformService): void {
  const { runtimes, targets, retryPolicies } = PLATFORM_HOST_CAPABILITIES;
  const hasObservations =
    Object.keys(service.events).length > 0 || Object.keys(service.interceptors).length > 0;
  const hasUnsupportedMethod = Object.values(service.methods).some(
    (method) =>
      !runtimes.includes(method.runtime) ||
      !retryPolicies.includes(method.retry) ||
      method.targets.some((target) => !targets.includes(target)) ||
      (method.requiredEnvelopeFields?.length ?? 0) > 0,
  );
  if (hasObservations || hasUnsupportedMethod) {
    throw executionError(
      "UNSUPPORTED_FEATURE",
      `Service ${service.serviceId} needs events, interceptors, envelopes, targets or retry policies this host does not execute`,
    );
  }
}

/** Loads a v1 package and rejects any contract this host cannot execute. */
export async function loadExecutablePlatformPackage(
  input: PlatformPackageInput,
): Promise<LoadedPlatformPackage> {
  const loaded = await loadPlatformPackage(input);
  for (const { definition } of loaded.services) assertExecutableService(definition);
  return loaded;
}
