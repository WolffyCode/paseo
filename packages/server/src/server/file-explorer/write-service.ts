import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { normalizeRelativePath, resolveScopedPath } from "./service.js";

export interface FsWriteResult {
  path: string;
}

interface CreateParams {
  root: string;
  requestedPath: string;
}

interface RenameParams {
  root: string;
  requestedPath: string;
  newName: string;
}

interface TransferParams {
  root: string;
  from: string;
  toDir: string;
}

// Create an empty file at `requestedPath` under `root`. O_EXCL makes it atomic and fail-fast on
// collision; a missing parent surfaces ENOENT (we do not auto-create directories — that's mkdir).
export async function createFile({ root, requestedPath }: CreateParams): Promise<FsWriteResult> {
  const scoped = await resolveScopedPath({ root, relativePath: requestedPath });
  const handle = await fs.open(
    scoped.resolvedPath,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
  );
  await handle.close();
  return { path: normalizeRelativePath({ root, targetPath: scoped.requestedPath }) };
}

// Create a single directory at `requestedPath` under `root`. Non-recursive so a missing parent
// (ENOENT) or an existing name (EEXIST) is reported instead of being silently absorbed.
export async function createDirectory({
  root,
  requestedPath,
}: CreateParams): Promise<FsWriteResult> {
  const scoped = await resolveScopedPath({ root, relativePath: requestedPath });
  await fs.mkdir(scoped.resolvedPath);
  return { path: normalizeRelativePath({ root, targetPath: scoped.requestedPath }) };
}

// Rename an entry in place (same directory). `newName` must be a bare name — separators are
// rejected so rename can never relocate or escape; collisions and missing sources fail explicitly.
export async function renameEntry({
  root,
  requestedPath,
  newName,
}: RenameParams): Promise<FsWriteResult> {
  if (newName.includes("/") || newName.includes("\\") || newName === "." || newName === "..") {
    throw new Error("Rename target must be a file name without path separators");
  }
  const source = await resolveScopedPath({ root, relativePath: requestedPath });
  const targetRelative = path.join(path.dirname(source.requestedPath), newName);
  const target = await resolveScopedPath({ root, relativePath: targetRelative });
  await rejectIfExists(target.resolvedPath);
  await fs.rename(source.resolvedPath, target.resolvedPath);
  return { path: normalizeRelativePath({ root, targetPath: target.requestedPath }) };
}

// Move (cut/paste) an entry into `toDir`, keeping its base name. Both endpoints are scope-checked;
// an existing destination fails rather than overwriting (POSIX rename would clobber silently).
export async function moveEntry({ root, from, toDir }: TransferParams): Promise<FsWriteResult> {
  const target = await resolveTransferTarget({ root, from, toDir });
  await rejectIfExists(target.resolvedPath);
  await fs.rename(target.sourcePath, target.resolvedPath);
  return { path: target.relativePath };
}

// Delete an entry under `root`: a file is unlinked, a directory is removed recursively. The path is
// scope-checked (cannot escape root) and the root itself is refused so a delete can never wipe the
// workspace. `recursive: true` removes non-empty directories; omitting `force` makes a missing target
// throw (ENOENT) instead of silently succeeding, so the caller learns the entry was already gone.
export async function deleteEntry({ root, requestedPath }: CreateParams): Promise<FsWriteResult> {
  const scoped = await resolveScopedPath({ root, relativePath: requestedPath });
  const relative = normalizeRelativePath({ root, targetPath: scoped.requestedPath });
  if (relative === ".") {
    throw new Error("Refusing to delete the workspace root");
  }
  await fs.rm(scoped.resolvedPath, { recursive: true });
  return { path: relative };
}

// Copy (copy/paste) an entry into `toDir`, recursing for directories and preserving the source.
// errorOnExist makes a destination collision fail loudly instead of merging into existing content.
export async function copyEntry({ root, from, toDir }: TransferParams): Promise<FsWriteResult> {
  const target = await resolveTransferTarget({ root, from, toDir });
  await rejectIfExists(target.resolvedPath);
  await fs.cp(target.sourcePath, target.resolvedPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  return { path: target.relativePath };
}

interface TransferTarget {
  sourcePath: string;
  resolvedPath: string;
  relativePath: string;
}

// Shared move/copy resolution: scope-check the source and the target directory, then build the
// landing path as `<toDir>/<sourceBaseName>` (scope-checked again) so both operations agree on it.
async function resolveTransferTarget({
  root,
  from,
  toDir,
}: TransferParams): Promise<TransferTarget> {
  const source = await resolveScopedPath({ root, relativePath: from });
  const directory = await resolveScopedPath({ root, relativePath: toDir });
  const targetRelative = path.join(directory.requestedPath, path.basename(source.requestedPath));
  const target = await resolveScopedPath({ root, relativePath: targetRelative });
  return {
    sourcePath: source.resolvedPath,
    resolvedPath: target.resolvedPath,
    relativePath: normalizeRelativePath({ root, targetPath: target.requestedPath }),
  };
}

// Fail with a stable message when a write would land on an existing entry, so callers get a
// deterministic "already exists" error instead of a silent overwrite or a platform-specific code.
async function rejectIfExists(target: string): Promise<void> {
  try {
    await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`An entry already exists at ${target}`);
}
