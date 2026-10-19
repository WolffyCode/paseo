import { readFile } from "node:fs/promises";
import log from "electron-log/main";

/** A JSON file's contents, or null when it is missing or unreadable. */
export async function readJsonFile(filePath: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    // A missing file is an ordinary answer here: no such profile, extension or locale.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("[chrome-import] unreadable file", { filePath, error });
    }
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    log.warn("[chrome-import] malformed JSON", { filePath, error });
    return null;
  }
}
