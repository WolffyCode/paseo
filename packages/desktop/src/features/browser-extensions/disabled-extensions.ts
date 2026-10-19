import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import log from "electron-log/main";

/** An installed extension the user turned off: what the extensions page shows, and where it is. */
export interface DisabledExtension<Summary> {
  summary: Summary;
  extensionPath: string;
}

interface DisabledExtensionsFile<Summary> {
  disabled: Record<string, DisabledExtension<Summary>>;
}

/**
 * The extensions the user turned off, kept on disk. Electron has no disabled state: a disabled
 * extension is simply not loaded, so this file is what remembers it across launches.
 */
export class DisabledExtensions<Summary> {
  private records = new Map<string, DisabledExtension<Summary>>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    try {
      const parsed = JSON.parse(raw) as DisabledExtensionsFile<Summary>;
      this.records = new Map(Object.entries(parsed.disabled ?? {}));
    } catch (error) {
      // A damaged file only loses which extensions were off; they load as enabled again.
      log.warn("[browser-extensions] unreadable disabled-extensions file; starting empty", error);
      this.records = new Map();
    }
  }

  has(extensionId: string): boolean {
    return this.records.has(extensionId);
  }

  get(extensionId: string): DisabledExtension<Summary> | null {
    return this.records.get(extensionId) ?? null;
  }

  list(): DisabledExtension<Summary>[] {
    return [...this.records.values()];
  }

  async add(extensionId: string, record: DisabledExtension<Summary>): Promise<void> {
    this.records.set(extensionId, record);
    await this.save();
  }

  async delete(extensionId: string): Promise<void> {
    if (this.records.delete(extensionId)) {
      await this.save();
    }
  }

  private async save(): Promise<void> {
    const file: DisabledExtensionsFile<Summary> = {
      disabled: Object.fromEntries(this.records),
    };
    // Write then rename, so a crash mid-write leaves the previous file intact.
    const temporaryPath = `${this.filePath}.tmp`;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(file, null, 2));
    await rename(temporaryPath, this.filePath);
  }
}
