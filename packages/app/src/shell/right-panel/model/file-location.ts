// The right panel's own file-position value type + identity rules. Equivalently rewritten from the
// legacy @/workspace/file-open (position-normalize + path-equality) so the new shell carries zero
// cross-directory dependency on the old workspace modules. A file's identity axis is its PATH ONLY —
// line numbers are open-after scroll targets, never part of who the file is (that keeps one file to
// one tab regardless of which line a jump requested).

export interface FileLocation {
  readonly path: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

// Canonicalize a location so one file has exactly one spelling: path trimmed, backslashes folded to
// forward slashes, empty/"." segments dropped (".." kept — not resolved), absolute leading slash
// preserved; line numbers clamped to 1-based positive integers with lineEnd never below lineStart.
export function normalizeFileLocation(raw: FileLocation): FileLocation {
  const lineStart = clampLine(raw.lineStart);
  const clampedEnd = clampLine(raw.lineEnd);
  const lineEnd =
    clampedEnd !== undefined && lineStart !== undefined
      ? Math.max(clampedEnd, lineStart)
      : clampedEnd;
  return {
    path: normalizePath(raw.path),
    ...(lineStart !== undefined ? { lineStart } : {}),
    ...(lineEnd !== undefined ? { lineEnd } : {}),
  };
}

// Whether two raw paths name the same file: normalized the same way, compared case-insensitively so
// Windows' case-insensitive filesystem never splits one file into two tabs. Identity = path only.
export function sameFilePath(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}

// The shared path canonicalization behind both normalizeFileLocation and sameFilePath, so the two can
// never disagree on what one file's path is.
function normalizePath(raw: string): string {
  const forward = raw.trim().replace(/\\/g, "/");
  const isAbsolute = forward.startsWith("/");
  const segments = forward.split("/").filter((segment) => segment !== "" && segment !== ".");
  const joined = segments.join("/");
  return isAbsolute ? `/${joined}` : joined;
}

// Coerce a raw line number to a 1-based positive integer, or undefined when absent/non-finite — a
// stale NaN/Infinity from a link parse must not leak a broken scroll target downstream.
function clampLine(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.floor(value));
}
