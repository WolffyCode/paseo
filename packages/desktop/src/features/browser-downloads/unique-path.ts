import path from "node:path";

// Chrome tries " (1)" up to " (100)", then once with the download's start time
// (components/download/internal/common/download_path_reservation_tracker.cc CreateUniqueFilename).
const MAX_UNIQUE_FILES = 100;
// base/files/file_path.cc: after one of these, a penultimate extension of 1–4 characters belongs to
// the extension too, so "a.tar.gz" becomes "a (1).tar.gz".
const DOUBLE_EXTENSION_SUFFIXES = new Set([
  "bz",
  "bz2",
  "gz",
  "lz",
  "lzma",
  "lzo",
  "xz",
  "z",
  "zst",
]);
const DOUBLE_EXTENSIONS = new Set(["user.js"]);
const MAX_PENULTIMATE_EXTENSION_LENGTH = 4;

/** Where a file name's extension starts, as FilePath::Extension splits it, or -1 for none. */
export function extensionStart(fileName: string): number {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return lastDot;
  }
  const penultimateDot = fileName.lastIndexOf(".", lastDot - 1);
  if (penultimateDot < 0) {
    return lastDot;
  }
  if (DOUBLE_EXTENSIONS.has(fileName.slice(penultimateDot + 1).toLowerCase())) {
    return penultimateDot;
  }
  const penultimateLength = lastDot - penultimateDot - 1;
  const isShortPenultimate =
    penultimateLength >= 1 && penultimateLength <= MAX_PENULTIMATE_EXTENSION_LENGTH;
  const isDoubleExtension = DOUBLE_EXTENSION_SUFFIXES.has(
    fileName.slice(lastDot + 1).toLowerCase(),
  );
  return isDoubleExtension && isShortPenultimate ? penultimateDot : lastDot;
}

/** FilePath::InsertBeforeExtension: "report.pdf" + " (1)" is "report (1).pdf". */
export function insertBeforeExtension(fileName: string, suffix: string): string {
  const start = extensionStart(fileName);
  if (start < 0) {
    return `${fileName}${suffix}`;
  }
  return `${fileName.slice(0, start)}${suffix}${fileName.slice(start)}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** Chrome's last-resort suffix: the local start time in ISO 8601 with the colons taken out. */
function startTimeSuffix(startTime: Date): string {
  const date = `${startTime.getFullYear()}-${twoDigits(startTime.getMonth() + 1)}-${twoDigits(startTime.getDate())}`;
  const time = `${twoDigits(startTime.getHours())}${twoDigits(startTime.getMinutes())}${twoDigits(startTime.getSeconds())}`;
  const milliseconds = String(startTime.getMilliseconds()).padStart(3, "0");
  return ` - ${date}T${time}.${milliseconds}`;
}

/**
 * Where Chrome saves a download in `directory`: the suggested name, or the first free numbered
 * name. Null when every name Chrome would try is taken; Chrome then asks where to save.
 */
export function uniqueDownloadPath(input: {
  directory: string;
  fileName: string;
  startTime: Date;
  isInUse: (candidatePath: string) => boolean;
}): string | null {
  const suggestedPath = path.join(input.directory, input.fileName);
  if (!input.isInUse(suggestedPath)) {
    return suggestedPath;
  }
  for (let uniquifier = 1; uniquifier <= MAX_UNIQUE_FILES + 1; uniquifier += 1) {
    const suffix =
      uniquifier > MAX_UNIQUE_FILES ? startTimeSuffix(input.startTime) : ` (${uniquifier})`;
    const candidatePath = path.join(input.directory, insertBeforeExtension(input.fileName, suffix));
    if (!input.isInUse(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}
