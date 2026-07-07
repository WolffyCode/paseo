import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { rgPath } from "@vscode/ripgrep";
import { normalizeRelativePath, resolveScopedPath } from "./service.js";

export interface SearchRange {
  start: number;
  end: number;
}

export interface SearchMatch {
  path: string;
  kind: "file" | "directory";
  line?: number;
  preview?: string;
  ranges?: SearchRange[];
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
}

export interface SearchParams {
  root: string;
  query: string;
  mode: "name" | "content";
  basePath?: string;
  limit?: number;
  // Progressive delivery: called with small batches of matches AS THE SCAN FINDS THEM, before the
  // full result returns — first hits reach the client sub-second while a wide root keeps scanning.
  // The returned result still carries the complete set; the batches are a preview, not the truth.
  onMatches?: (matches: SearchMatch[]) => void;
  // Cooperative cancellation: aborting kills the rg child / stops the walk early. The search still
  // RESOLVES (with whatever it found, truncated) — supersede semantics, not an error.
  signal?: AbortSignal;
  // Test seam: skip the ripgrep attempt and exercise the Node walk fallback directly. Production
  // callers leave this unset so ripgrep is preferred when the `rg` binary is available.
  forceNodeContentWalk?: boolean;
  // Test seam: override the ripgrep kill deadline so the timeout path is testable in milliseconds.
  // Production callers leave this unset (RG_TIMEOUT_MS).
  rgTimeoutMs?: number;
  // Test seam: run exactly this rg binary instead of the bundled→PATH candidate chain, so tests can
  // script rg's behavior (hang, exit 2, …). Production callers leave this unset.
  rgBinaryPath?: string;
}

const DEFAULT_LIMIT = 200;
const RG_TIMEOUT_MS = 15_000;
const MAX_PREVIEW_LENGTH = 200;
// The only directories search skips. The tree DISPLAYS everything including dotfiles, and search
// matches that scope (chairman decision 2026-07-07: hidden entries are first-class — a file inside
// `.dev/` must be findable). Only the heavy machine-generated dirs stay excluded: searching
// .git/node_modules/build-output is noise at wide-root scale and was never what tree search is for.
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "out", "coverage"]);

// Search the host filesystem under `root` (optionally narrowed to `basePath`). Name mode matches
// entry names via a Node walk; content mode prefers ripgrep and degrades to a Node walk + substring
// scan when `rg` is unavailable. Results are bounded by `limit` and flag `truncated` when cut off.
// There is deliberately NO index: every call scans the live filesystem, so results always reflect
// the current file names/contents (edits and renames can never go stale between searches).
export async function searchFiles(params: SearchParams): Promise<SearchResult> {
  const limit = normalizeLimit(params.limit);
  const scoped = await resolveScopedPath({
    root: params.root,
    relativePath: params.basePath ?? ".",
  });
  if (!params.query) {
    return { matches: [], truncated: false };
  }

  // Walk/search from the requested (non-realpath) base so emitted child paths share the root's path
  // namespace; on macOS the resolved path can be a /private symlink that would otherwise escape root.
  const base = scoped.requestedPath;
  const batcher = params.onMatches ? createMatchBatcher(params.onMatches) : null;
  const onMatch = batcher?.add;
  const signal = params.signal;

  try {
    if (params.mode === "name") {
      return await walkForNameMatches({
        root: params.root,
        base,
        query: params.query,
        limit,
        onMatch,
        signal,
      });
    }

    if (!params.forceNodeContentWalk) {
      const viaRipgrep = await searchContentWithRipgrep({
        root: params.root,
        base,
        query: params.query,
        limit,
        timeoutMs: params.rgTimeoutMs ?? RG_TIMEOUT_MS,
        onMatch,
        signal,
        ...(params.rgBinaryPath ? { binaryOverride: params.rgBinaryPath } : {}),
      });
      if (viaRipgrep) {
        return viaRipgrep;
      }
    }
    return await walkForContentMatches({
      root: params.root,
      base,
      query: params.query,
      limit,
      onMatch,
      signal,
    });
  } finally {
    // Flush any sub-batch remainder so the progress stream never trails the final response.
    batcher?.flush();
  }
}

// Batch streamed matches so a progressive search emits a few progress frames, not one per hit —
// a wide scan can produce hundreds of matches in a burst and per-hit frames would flood the socket.
function createMatchBatcher(
  emit: (batch: SearchMatch[]) => void,
  flushMs = 80,
  maxBatch = 25,
): { add: (match: SearchMatch) => void; flush: () => void } {
  let pending: SearchMatch[] = [];
  let timer: NodeJS.Timeout | null = null;
  const flush = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending.length > 0) {
      const batch = pending;
      pending = [];
      emit(batch);
    }
  };
  return {
    add(match: SearchMatch): void {
      pending.push(match);
      if (pending.length >= maxBatch) {
        flush();
        return;
      }
      if (!timer) {
        timer = setTimeout(flush, flushMs);
      }
    },
    flush,
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.floor(limit);
}

function shouldSkipDirectory(name: string): boolean {
  return SKIPPED_DIRECTORIES.has(name);
}

interface WalkParams {
  root: string;
  base: string;
  query: string;
  limit: number;
  // Streams each match as found (see SearchParams.onMatches) — undefined for plain full-result runs.
  onMatch?: (match: SearchMatch) => void;
  // Cooperative cancellation: an aborted walk stops early and reports truncated.
  signal?: AbortSignal;
}

// Depth-first walk collecting entries whose name contains `query` (case-insensitive). Only the
// heavy generated dirs (SKIPPED_DIRECTORIES) are pruned — hidden entries are in scope, matching
// what the tree displays. The walk stops as soon as `limit + 1` hits are seen so truncation is exact.
async function walkForNameMatches({
  root,
  base,
  query,
  limit,
  onMatch,
  signal,
}: WalkParams): Promise<SearchResult> {
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];
  let truncated = false;

  const visit = async (dir: string): Promise<void> => {
    if (truncated) {
      return;
    }
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (truncated) {
        return;
      }
      if (signal?.aborted) {
        truncated = true;
        return;
      }
      const absolute = path.join(dir, dirent.name);
      const isDirectory = dirent.isDirectory();
      if (dirent.name.toLowerCase().includes(needle)) {
        if (matches.length >= limit) {
          truncated = true;
          return;
        }
        const match: SearchMatch = {
          path: normalizeRelativePath({ root, targetPath: absolute }),
          kind: isDirectory ? "directory" : "file",
        };
        matches.push(match);
        onMatch?.(match);
      }
      if (isDirectory && !shouldSkipDirectory(dirent.name)) {
        await visit(absolute);
      }
    }
  };

  await visit(base);
  return { matches, truncated };
}

// Node fallback for content search: read each text file under `base`, record the first line that
// contains `query`. Used only when ripgrep is absent; bounded identically by `limit`.
async function walkForContentMatches({
  root,
  base,
  query,
  limit,
  onMatch,
  signal,
}: WalkParams): Promise<SearchResult> {
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];
  let truncated = false;

  const visit = async (dir: string): Promise<void> => {
    if (truncated) {
      return;
    }
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const dirent of dirents) {
      if (truncated) {
        return;
      }
      if (signal?.aborted) {
        truncated = true;
        return;
      }
      const absolute = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (!shouldSkipDirectory(dirent.name)) {
          await visit(absolute);
        }
        continue;
      }
      if (!dirent.isFile()) {
        continue;
      }
      const hit = await firstContentHit(absolute, needle, query);
      if (!hit) {
        continue;
      }
      if (matches.length >= limit) {
        truncated = true;
        return;
      }
      const match: SearchMatch = {
        path: normalizeRelativePath({ root, targetPath: absolute }),
        kind: "file",
        line: hit.line,
        preview: hit.preview,
        ranges: hit.ranges,
      };
      matches.push(match);
      onMatch?.(match);
    }
  };

  await visit(base);
  return { matches, truncated };
}

interface ContentHit {
  line: number;
  preview: string;
  ranges: SearchRange[];
}

// Read a file as UTF-8 and return the first line containing the (case-insensitive) query, with the
// match column range. Returns null for binary/unreadable files so the walk simply skips them.
async function firstContentHit(
  absolute: string,
  needle: string,
  rawQuery: string,
): Promise<ContentHit | null> {
  const buffer = await fs.readFile(absolute).catch(() => null);
  if (!buffer || buffer.includes(0)) {
    return null;
  }
  const text = buffer.toString("utf-8");
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index].toLowerCase().indexOf(needle);
    if (column !== -1) {
      return {
        line: index + 1,
        preview: lines[index].slice(0, MAX_PREVIEW_LENGTH),
        ranges: [{ start: column, end: column + rawQuery.length }],
      };
    }
  }
  return null;
}

interface RipgrepParams {
  root: string;
  base: string;
  query: string;
  limit: number;
  timeoutMs: number;
  // Streams each match as parsed (see SearchParams.onMatches).
  onMatch?: (match: SearchMatch) => void;
  // Cooperative cancellation: aborting kills the rg child; the run resolves with what it found.
  signal?: AbortSignal;
  // Test seam (see SearchParams.rgBinaryPath): run exactly this binary, skipping the candidates.
  binaryOverride?: string;
}

// Candidate rg binaries, best first: the dependency-bundled @vscode/ripgrep binary (deterministic —
// present on every install, so content search never silently degrades to the slow Node walk on
// machines without a system rg, which is exactly what produced the 25–30s searches), then a
// PATH-installed `rg` as a fallback for pruned-node_modules setups. A missing candidate fails at
// spawn and the next one is tried.
function ripgrepBinaryCandidates(): string[] {
  return [rgPath, "rg"];
}

// Run a fixed-string ripgrep JSON search under `base`, trying each candidate binary. Returns parsed
// matches on success, or null when no binary can run / ripgrep hard-fails — only then does the
// caller fall back to the Node walk.
async function searchContentWithRipgrep(params: RipgrepParams): Promise<SearchResult | null> {
  const candidates = params.binaryOverride ? [params.binaryOverride] : ripgrepBinaryCandidates();
  for (const binary of candidates) {
    const outcome = await runRipgrepBinary(binary, params);
    if (outcome !== "spawn-error") {
      return outcome;
    }
  }
  return null;
}

// One ripgrep invocation. Resolution semantics:
// - "spawn-error": the binary is missing/unrunnable → caller tries the next candidate.
// - Exit 0 (matches) and 1 (no matches) are valid results.
// - Exit 2 with structured JSON output still counts as a valid result: rg exits 2 when ANY file was
//   unreadable (near-certain on a Desktop-wide scan), but its matches over the readable set are
//   complete — discarding them used to trigger the full Node re-walk and the 25–30s searches.
// - The kill deadline resolves with the matches streamed SO FAR (truncated), never null, so a slow
//   scan degrades to partial results instead of double-scanning.
function runRipgrepBinary(
  binary: string,
  { root, base, query, limit, timeoutMs, onMatch, signal }: RipgrepParams,
): Promise<SearchResult | null | "spawn-error"> {
  return new Promise((resolve) => {
    const child = spawn(
      binary,
      [
        "--json",
        "--fixed-strings",
        "--no-messages",
        "--max-count=1",
        // Hidden entries are in scope (the tree displays them, so search must find them) and
        // gitignored files too — the tree shows those as well; search matches the DISPLAYED tree,
        // not a repo's ignore rules.
        "--hidden",
        "--no-ignore",
        // The only exclusions, mirroring the Node walks' SKIPPED_DIRECTORIES: heavy generated dirs
        // whose contents are search noise. --hidden/--no-ignore would otherwise pull .git in.
        "--glob=!node_modules",
        "--glob=!.git",
        "--glob=!dist",
        "--glob=!build",
        "--glob=!out",
        "--glob=!coverage",
        // Skip huge blobs (media, bundles, lockfile monsters): grinding through them is where a
        // wide-root scan loses seconds, and a >2M file is not what tree search is for.
        "--max-filesize=2M",
        "--",
        query,
        ".",
      ],
      { cwd: base, windowsHide: true },
    );

    const matches: SearchMatch[] = [];
    let truncated = false;
    let sawStructuredOutput = false;
    let stdoutBuffer = "";
    let settled = false;

    // Run the resolve callback at most once; callers pass the actual resolve so there is a single
    // settle gate (mirrors run-git-command's pattern and keeps the static no-multiple-resolved rule).
    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };

    // Deadline: kill rg and return what it already found (truncated) instead of resolving null —
    // null would send the caller into the full Node re-walk on top of the seconds already spent.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => resolve({ matches, truncated: true }));
    }, timeoutMs);

    // Supersede semantics: an aborted search resolves with its partial findings, never an error —
    // the newer request's results will replace them client-side anyway.
    const onAbort = (): void => {
      child.kill("SIGKILL");
      settle(() => resolve({ matches, truncated: true }));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", () => settle(() => resolve("spawn-error")));

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (matches.length >= limit) {
          truncated = true;
          child.kill("SIGKILL");
          break;
        }
        const event = parseRipgrepLine(line);
        if (event) {
          sawStructuredOutput = true;
          const match = toSearchMatch({ root, base, event });
          if (match) {
            matches.push(match);
            onMatch?.(match);
          }
        }
        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });

    child.on("close", (code) => {
      // 0 = matches, 1 = no matches. 2 = completed with per-file errors — trust it when the JSON
      // stream was well-formed (see above). Anything else without output means rg itself failed.
      const succeeded =
        code === 0 ||
        code === 1 ||
        (truncated && code !== null) ||
        (code === 2 && sawStructuredOutput);
      settle(() => resolve(succeeded ? { matches, truncated } : null));
    });
  });
}

// Parse a single ripgrep `--json` line into its event object (any event type), or null for blank /
// malformed lines. Seeing ANY well-formed event is the signal that rg ran and produced real output.
function parseRipgrepLine(line: string): RipgrepEvent | null {
  if (!line.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(line) as RipgrepEvent;
    return typeof parsed?.type === "string" ? parsed : null;
  } catch {
    return null;
  }
}

// Convert a ripgrep `type: "match"` event into a SearchMatch (other event types → null).
// ripgrep paths are relative to `base`; rebase them onto the search root for a stable client path.
function toSearchMatch({
  root,
  base,
  event,
}: {
  root: string;
  base: string;
  event: RipgrepEvent;
}): SearchMatch | null {
  if (event.type !== "match" || !event.data?.path?.text) {
    return null;
  }
  const absolute = path.resolve(base, event.data.path.text);
  const submatch = event.data.submatches?.[0];
  return {
    path: normalizeRelativePath({ root, targetPath: absolute }),
    kind: "file",
    line: event.data.line_number,
    preview:
      typeof event.data.lines?.text === "string"
        ? event.data.lines.text.replace(/\n$/, "").slice(0, MAX_PREVIEW_LENGTH)
        : undefined,
    ranges: submatch ? [{ start: submatch.start, end: submatch.end }] : undefined,
  };
}

interface RipgrepEvent {
  type: string;
  data?: {
    path?: { text?: string };
    line_number?: number;
    lines?: { text?: string };
    submatches?: Array<{ start: number; end: number }>;
  };
}
