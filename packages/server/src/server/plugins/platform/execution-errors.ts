import type { PlatformDiagnostic } from "@getpaseo/protocol/plugin-platform";
import type { PlatformError } from "@getpaseo/protocol/plugin-platform-execution";
import { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";

// Codes whose cause can clear without the caller changing its request.
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "DEADLINE_EXCEEDED",
  "DEPENDENCY_MISSING",
  "LIMIT_EXCEEDED",
  "PLUGIN_UNAVAILABLE",
]);

/**
 * A failure a worker reported. `outcomeKnown` is true when the method did not run, or ran and
 * returned this failure itself; false means its side effects may have happened.
 */
export class PlatformWorkerError extends PluginPlatformError {
  // Plugin processes load this file through Node's type stripping, which rejects parameter properties.
  readonly outcomeKnown: boolean;

  constructor(diagnostic: PlatformDiagnostic, outcomeKnown: boolean) {
    super(diagnostic);
    this.name = "PlatformWorkerError";
    this.outcomeKnown = outcomeKnown;
  }
}

/** A failure whose wire error hands the caller structured details, such as a revision to replace. */
export class PlatformDetailedError extends PluginPlatformError {
  readonly details: NonNullable<PlatformError["details"]>;

  constructor(diagnostic: PlatformDiagnostic, details: NonNullable<PlatformError["details"]>) {
    super(diagnostic);
    this.name = "PlatformDetailedError";
    this.details = details;
  }
}

export function executionError(code: string, message: string): PluginPlatformError {
  return new PluginPlatformError({ code, message });
}

export function platformError(diagnostic: PlatformDiagnostic): PlatformError {
  return {
    code: diagnostic.code,
    message: diagnostic.message || diagnostic.code,
    retryable: RETRYABLE_CODES.has(diagnostic.code),
  };
}

export function toDiagnostic(error: unknown): PlatformDiagnostic {
  if (error instanceof PluginPlatformError) return error.diagnostic;
  return { code: "INTERNAL", message: describeUnknownError(error) };
}

export function toPlatformError(error: unknown): PlatformError {
  const failure = platformError(toDiagnostic(error));
  if (error instanceof PlatformDetailedError) return { ...failure, details: error.details };
  return failure;
}

export function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
