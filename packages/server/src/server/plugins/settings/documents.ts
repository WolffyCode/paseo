import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/** The revision of a document that does not exist. */
export const MISSING_SETTINGS_REVISION = "missing";
/** The stored form of every plugin settings document: its schema version and values. */
export const SettingsEnvelopeSchema = z.object({
  version: z.number().int().positive(),
  values: z.json(),
});
export interface SettingsDocument {
  /** The stored text, or null when the document does not exist. */
  readonly raw: string | null;
  readonly revision: string;
}

function revisionOf(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function serializeSettings(version: number, values: unknown): string {
  return JSON.stringify({ version, values: z.json().parse(values) });
}

/**
 * The settings documents of one installation, named by paths relative to its directory. Writes
 * replace a document atomically; revisions are content hashes, so equal text has equal revisions.
 */
export class PluginSettingsDocuments {
  // Plugin processes load this file through Node's type stripping, which rejects parameter properties.
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async read(name: string): Promise<SettingsDocument> {
    try {
      const raw = await readFile(path.join(this.directory, name), "utf8");
      return { raw, revision: revisionOf(raw) };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
        return { raw: null, revision: MISSING_SETTINGS_REVISION };
      throw error;
    }
  }

  async write(name: string, raw: string): Promise<string> {
    const target = path.join(this.directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, raw, { mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    return revisionOf(raw);
  }

  async remove(name: string): Promise<void> {
    await rm(path.join(this.directory, name), { force: true });
  }
}
