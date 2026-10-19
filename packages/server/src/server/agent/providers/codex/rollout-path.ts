import { promises as fs } from "node:fs";
import path from "node:path";

// Codex writes a thread to `sessions/YYYY/MM/DD/rollout-<local time>-<thread id>.jsonl`,
// compresses older rollouts in place to `.jsonl.zst`, and moves archived threads into the
// flat `archived_sessions` directory.
const SESSIONS_DIRECTORY = "sessions";
const ARCHIVED_SESSIONS_DIRECTORY = "archived_sessions";
const ROLLOUT_FILE_PREFIX = "rollout-";
const ROLLOUT_FILE_EXTENSIONS = [".jsonl", ".jsonl.zst"] as const;
const DATE_PART_WIDTH = 2;

// Codex thread ids are UUIDv7: the leading 48 bits are the creation time in Unix milliseconds.
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_TIMESTAMP_HEX_DIGITS = 12;
const HEX_RADIX = 16;
const MILLISECONDS_PER_DAY = 86_400_000;
// The day directory follows the creating host's local date, which is within one day of the
// UTC date the thread id carries.
const LOCAL_DAY_OFFSETS = [0, -1, 1] as const;

export interface CodexRolloutLookup {
  codexHome: string;
  threadId: string;
}

/** The rollout file that holds a Codex thread, or null when none is on disk. */
export async function findCodexRolloutPath(lookup: CodexRolloutLookup): Promise<string | null> {
  const candidateDirectories = [
    ...listSessionDayDirectories(lookup),
    path.join(lookup.codexHome, ARCHIVED_SESSIONS_DIRECTORY),
  ];
  for (const directory of candidateDirectories) {
    const rolloutPath = await findRolloutInDirectory(directory, lookup.threadId);
    if (rolloutPath) {
      return rolloutPath;
    }
  }
  return null;
}

// Only the creation time bounds the lookup to a few day directories. An id without one would
// mean walking every day Codex has recorded, so it can only match an archived rollout.
function listSessionDayDirectories(lookup: CodexRolloutLookup): string[] {
  const createdAtMs = readThreadCreationTime(lookup.threadId);
  if (createdAtMs === null) {
    return [];
  }
  return LOCAL_DAY_OFFSETS.map((dayOffset) => {
    const day = new Date(createdAtMs + dayOffset * MILLISECONDS_PER_DAY);
    return path.join(
      lookup.codexHome,
      SESSIONS_DIRECTORY,
      String(day.getUTCFullYear()),
      formatDatePart(day.getUTCMonth() + 1),
      formatDatePart(day.getUTCDate()),
    );
  });
}

function readThreadCreationTime(threadId: string): number | null {
  if (!UUID_V7_PATTERN.test(threadId)) {
    return null;
  }
  const timestampHex = threadId.replace(/-/g, "").slice(0, UUID_V7_TIMESTAMP_HEX_DIGITS);
  return Number.parseInt(timestampHex, HEX_RADIX);
}

function formatDatePart(value: number): string {
  return String(value).padStart(DATE_PART_WIDTH, "0");
}

async function findRolloutInDirectory(directory: string, threadId: string): Promise<string | null> {
  const fileNames = await listFileNames(directory);
  for (const extension of ROLLOUT_FILE_EXTENSIONS) {
    const rolloutSuffix = `-${threadId}${extension}`;
    const rolloutFileName = fileNames.find(
      (fileName) => fileName.startsWith(ROLLOUT_FILE_PREFIX) && fileName.endsWith(rolloutSuffix),
    );
    if (rolloutFileName) {
      return path.join(directory, rolloutFileName);
    }
  }
  return null;
}

async function listFileNames(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}
