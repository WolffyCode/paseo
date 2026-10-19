import path from "node:path";

// Types Chrome never opens by itself on macOS: download_file_types.asciipb marks them
// ALLOW_ON_USER_GESTURE or DISALLOW_AUTO_OPEN (disk images, installers, scripts, executables).
const NEVER_AUTO_OPEN_EXTENSIONS = new Set([
  "app",
  "applescript",
  "bash",
  "command",
  "crx",
  "dmg",
  "dylib",
  "img",
  "jar",
  "mobileconfig",
  "mpkg",
  "pkg",
  "py",
  "scpt",
  "sh",
  "webloc",
  "workflow",
  "xip",
]);

/** The file's extension in lower case, without the dot; empty for a name without one. */
export function downloadExtension(fileName: string): string {
  return path.extname(fileName).slice(1).toLowerCase();
}

/**
 * Whether Chrome offers 总是打开此类文件 for a file: it needs an extension, and dangerous types
 * never open by themselves.
 */
export function canOpenTypeAutomatically(fileName: string): boolean {
  const extension = downloadExtension(fileName);
  return extension !== "" && !NEVER_AUTO_OPEN_EXTENSIONS.has(extension);
}
