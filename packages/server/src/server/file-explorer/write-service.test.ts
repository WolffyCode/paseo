import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  copyEntry,
  createDirectory,
  createFile,
  deleteEntry,
  moveEntry,
  renameEntry,
  writeFileContent,
} from "./write-service.js";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

describe("fs write service · createFile", () => {
  it("creates an empty file and returns its normalized relative path", async () => {
    const root = await createTempDir("paseo-fs-write-create-");
    try {
      const result = await createFile({ root, requestedPath: "notes.txt" });
      expect(result.path).toBe("notes.txt");
      expect(await readFile(path.join(root, "notes.txt"), "utf-8")).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects creating a file whose parent directory does not exist", async () => {
    const root = await createTempDir("paseo-fs-write-create-missing-");
    try {
      await expect(createFile({ root, requestedPath: "missing/notes.txt" })).rejects.toThrow();
      expect(await pathExists(path.join(root, "missing"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects when a file with the same name already exists", async () => {
    const root = await createTempDir("paseo-fs-write-create-dup-");
    try {
      await writeFile(path.join(root, "dup.txt"), "existing", "utf-8");
      await expect(createFile({ root, requestedPath: "dup.txt" })).rejects.toThrow();
      // Existing content is untouched.
      expect(await readFile(path.join(root, "dup.txt"), "utf-8")).toBe("existing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that escapes the root", async () => {
    const root = await createTempDir("paseo-fs-write-create-escape-");
    try {
      await expect(createFile({ root, requestedPath: "../escape.txt" })).rejects.toThrow(
        "Access outside of workspace is not allowed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs write service · createDirectory", () => {
  it("creates a directory under an existing parent and returns its normalized path", async () => {
    const root = await createTempDir("paseo-fs-write-mkdir-");
    try {
      await mkdir(path.join(root, "src"));
      const result = await createDirectory({ root, requestedPath: "src/components" });
      expect(result.path).toBe("src/components");
      expect((await stat(path.join(root, "src/components"))).isDirectory()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects creating a directory whose parent does not exist", async () => {
    const root = await createTempDir("paseo-fs-write-mkdir-missing-");
    try {
      await expect(createDirectory({ root, requestedPath: "ghost/leaf" })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects when a directory with the same name already exists", async () => {
    const root = await createTempDir("paseo-fs-write-mkdir-dup-");
    try {
      await mkdir(path.join(root, "src"));
      await expect(createDirectory({ root, requestedPath: "src" })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a directory path that escapes the root", async () => {
    const root = await createTempDir("paseo-fs-write-mkdir-escape-");
    try {
      await expect(createDirectory({ root, requestedPath: "../evil" })).rejects.toThrow(
        "Access outside of workspace is not allowed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs write service · renameEntry", () => {
  it("renames a file within its directory and returns the new path", async () => {
    const root = await createTempDir("paseo-fs-write-rename-");
    try {
      await writeFile(path.join(root, "old.ts"), "x", "utf-8");
      const result = await renameEntry({ root, requestedPath: "old.ts", newName: "new.ts" });
      expect(result.path).toBe("new.ts");
      expect(await pathExists(path.join(root, "old.ts"))).toBe(false);
      expect(await readFile(path.join(root, "new.ts"), "utf-8")).toBe("x");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("renames a nested file keeping it in the same directory", async () => {
    const root = await createTempDir("paseo-fs-write-rename-nested-");
    try {
      await mkdir(path.join(root, "src"));
      await writeFile(path.join(root, "src/old.ts"), "x", "utf-8");
      const result = await renameEntry({ root, requestedPath: "src/old.ts", newName: "new.ts" });
      expect(result.path).toBe("src/new.ts");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects renaming to a name that already exists", async () => {
    const root = await createTempDir("paseo-fs-write-rename-dup-");
    try {
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await writeFile(path.join(root, "b.ts"), "b", "utf-8");
      await expect(renameEntry({ root, requestedPath: "a.ts", newName: "b.ts" })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects renaming a file that does not exist", async () => {
    const root = await createTempDir("paseo-fs-write-rename-missing-");
    try {
      await expect(
        renameEntry({ root, requestedPath: "ghost.ts", newName: "new.ts" }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a newName containing a path separator (rename stays in-directory)", async () => {
    const root = await createTempDir("paseo-fs-write-rename-sep-");
    try {
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await expect(
        renameEntry({ root, requestedPath: "a.ts", newName: "../b.ts" }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs write service · moveEntry", () => {
  it("moves a file into a target directory and returns the landed path", async () => {
    const root = await createTempDir("paseo-fs-write-move-");
    try {
      await mkdir(path.join(root, "lib"));
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      const result = await moveEntry({ root, from: "a.ts", toDir: "lib" });
      expect(result.path).toBe("lib/a.ts");
      expect(await pathExists(path.join(root, "a.ts"))).toBe(false);
      expect(await readFile(path.join(root, "lib/a.ts"), "utf-8")).toBe("a");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects moving onto an existing entry in the target directory", async () => {
    const root = await createTempDir("paseo-fs-write-move-dup-");
    try {
      await mkdir(path.join(root, "lib"));
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await writeFile(path.join(root, "lib/a.ts"), "existing", "utf-8");
      await expect(moveEntry({ root, from: "a.ts", toDir: "lib" })).rejects.toThrow();
      expect(await readFile(path.join(root, "lib/a.ts"), "utf-8")).toBe("existing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects moving outside the root", async () => {
    const root = await createTempDir("paseo-fs-write-move-escape-");
    try {
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await expect(moveEntry({ root, from: "a.ts", toDir: ".." })).rejects.toThrow(
        "Access outside of workspace is not allowed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs write service · copyEntry", () => {
  it("copies a file into a target directory and keeps the source", async () => {
    const root = await createTempDir("paseo-fs-write-copy-");
    try {
      await mkdir(path.join(root, "lib"));
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      const result = await copyEntry({ root, from: "a.ts", toDir: "lib" });
      expect(result.path).toBe("lib/a.ts");
      expect(await readFile(path.join(root, "a.ts"), "utf-8")).toBe("a");
      expect(await readFile(path.join(root, "lib/a.ts"), "utf-8")).toBe("a");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("copies a directory recursively", async () => {
    const root = await createTempDir("paseo-fs-write-copy-dir-");
    try {
      await mkdir(path.join(root, "src/nested"), { recursive: true });
      await writeFile(path.join(root, "src/nested/deep.ts"), "deep", "utf-8");
      await mkdir(path.join(root, "out"));
      const result = await copyEntry({ root, from: "src", toDir: "out" });
      expect(result.path).toBe("out/src");
      expect(await readFile(path.join(root, "out/src/nested/deep.ts"), "utf-8")).toBe("deep");
      // Source remains.
      expect(await readFile(path.join(root, "src/nested/deep.ts"), "utf-8")).toBe("deep");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects copying onto an existing entry in the target directory", async () => {
    const root = await createTempDir("paseo-fs-write-copy-dup-");
    try {
      await mkdir(path.join(root, "lib"));
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await writeFile(path.join(root, "lib/a.ts"), "existing", "utf-8");
      await expect(copyEntry({ root, from: "a.ts", toDir: "lib" })).rejects.toThrow();
      expect(await readFile(path.join(root, "lib/a.ts"), "utf-8")).toBe("existing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects copying outside the root", async () => {
    const root = await createTempDir("paseo-fs-write-copy-escape-");
    try {
      await writeFile(path.join(root, "a.ts"), "a", "utf-8");
      await expect(copyEntry({ root, from: "a.ts", toDir: ".." })).rejects.toThrow(
        "Access outside of workspace is not allowed",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs write service · deleteEntry", () => {
  it("deletes a file and returns its normalized relative path", async () => {
    const root = await createTempDir("paseo-fs-write-delete-file-");
    try {
      await writeFile(path.join(root, "gone.ts"), "x", "utf-8");
      const result = await deleteEntry({ root, requestedPath: "gone.ts" });
      expect(result.path).toBe("gone.ts");
      expect(await pathExists(path.join(root, "gone.ts"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recursively deletes a non-empty directory", async () => {
    const root = await createTempDir("paseo-fs-write-delete-dir-");
    try {
      await mkdir(path.join(root, "src/nested"), { recursive: true });
      await writeFile(path.join(root, "src/nested/deep.ts"), "deep", "utf-8");
      const result = await deleteEntry({ root, requestedPath: "src" });
      expect(result.path).toBe("src");
      expect(await pathExists(path.join(root, "src"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects deleting an entry that does not exist", async () => {
    const root = await createTempDir("paseo-fs-write-delete-missing-");
    try {
      await expect(deleteEntry({ root, requestedPath: "ghost.ts" })).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects deleting the root itself (refuses to wipe the workspace)", async () => {
    const root = await createTempDir("paseo-fs-write-delete-root-");
    try {
      await expect(deleteEntry({ root, requestedPath: "." })).rejects.toThrow();
      expect(await pathExists(root)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that escapes the root", async () => {
    const root = await createTempDir("paseo-fs-write-delete-escape-");
    const sibling = await createTempDir("paseo-fs-write-delete-sibling-");
    try {
      await writeFile(path.join(sibling, "keep.ts"), "keep", "utf-8");
      await expect(deleteEntry({ root, requestedPath: "../keep.ts" })).rejects.toThrow(
        "Access outside of workspace is not allowed",
      );
      // The out-of-scope sibling file is untouched.
      expect(await pathExists(path.join(sibling, "keep.ts"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(sibling, { recursive: true, force: true });
    }
  });
});

describe("fs write service · writeFileContent", () => {
  it("overwrites content when the expected mtime matches and returns the fresh on-disk mtime", async () => {
    const root = await createTempDir("paseo-fs-write-content-");
    try {
      await writeFile(path.join(root, "doc.md"), "old body", "utf-8");
      const expectedModifiedAt = (await stat(path.join(root, "doc.md"))).mtime.toISOString();

      const result = await writeFileContent({
        root,
        requestedPath: "doc.md",
        content: "new body",
        expectedModifiedAt,
      });

      // Landed (not a conflict): content replaced and the returned mtime equals the new on-disk mtime.
      expect("modifiedAt" in result).toBe(true);
      expect(result.path).toBe("doc.md");
      expect(await readFile(path.join(root, "doc.md"), "utf-8")).toBe("new body");
      if ("modifiedAt" in result) {
        const onDisk = (await stat(path.join(root, "doc.md"))).mtime.toISOString();
        expect(result.modifiedAt).toBe(onDisk);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns a conflict with the host mtime and does not write when the expected mtime is stale", async () => {
    const root = await createTempDir("paseo-fs-write-content-conflict-");
    try {
      await writeFile(path.join(root, "doc.md"), "on disk", "utf-8");
      const hostModifiedAt = (await stat(path.join(root, "doc.md"))).mtime.toISOString();

      const result = await writeFileContent({
        root,
        requestedPath: "doc.md",
        content: "should not land",
        // Stale baseline (file was changed externally since open) → the guard must trip.
        expectedModifiedAt: "1970-01-01T00:00:00.000Z",
      });

      expect("conflict" in result).toBe(true);
      expect(result.path).toBe("doc.md");
      if ("conflict" in result) {
        expect(result.conflict.hostModifiedAt).toBe(hostModifiedAt);
      }
      // The overwrite was refused: the on-disk content is untouched.
      expect(await readFile(path.join(root, "doc.md"), "utf-8")).toBe("on disk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects writing content to a file that does not exist (autosave targets an open file)", async () => {
    const root = await createTempDir("paseo-fs-write-content-missing-");
    try {
      await expect(
        writeFileContent({
          root,
          requestedPath: "ghost.md",
          content: "x",
          expectedModifiedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that escapes the root before touching the filesystem", async () => {
    const root = await createTempDir("paseo-fs-write-content-escape-");
    try {
      await expect(
        writeFileContent({
          root,
          requestedPath: "../escape.txt",
          content: "x",
          expectedModifiedAt: new Date().toISOString(),
        }),
      ).rejects.toThrow("Access outside of workspace is not allowed");
      expect(await pathExists(path.join(root, "..", "escape.txt"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
