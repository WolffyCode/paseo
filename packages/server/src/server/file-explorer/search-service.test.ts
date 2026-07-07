import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { searchFiles } from "./search-service.js";

async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

// A small fixture tree exercised by both engines (ripgrep when present, Node walk otherwise).
// Hidden entries (.hidden/, .dotfile.ts) are IN search scope — the tree displays them, so search
// must find them; only the heavy generated dirs (node_modules/.git/dist/…) stay excluded. A
// .gitignore covering .hidden proves ignore rules don't shrink the scope either (--no-ignore).
async function seedTree(root: string): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "src/inner"), { recursive: true });
  await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
  await mkdir(path.join(root, ".hidden"), { recursive: true });
  await mkdir(path.join(root, ".git/objects"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), ".hidden/\n");
  await writeFile(path.join(root, "src/alpha.ts"), "const needle = 1;\nconst other = 2;\n");
  await writeFile(path.join(root, "src/inner/beta.ts"), "// nothing here\nexport const x = 9;\n");
  await writeFile(path.join(root, "src/inner/needle-name.txt"), "irrelevant body\n");
  await writeFile(path.join(root, "node_modules/pkg/index.js"), "const needle = 3;\n");
  await writeFile(path.join(root, ".hidden/secret.ts"), "const needle = 4;\n");
  await writeFile(path.join(root, ".git/objects/blob.txt"), "const needle = 5;\n");
  await writeFile(path.join(root, "readme.md"), "no match in here\n");
}

function paths(matches: Array<{ path: string }>): string[] {
  return matches.map((m) => m.path).sort();
}

describe("fs search service · content mode", () => {
  it("finds files whose contents contain the query — hidden and gitignored ones included", async () => {
    const root = await createTempDir("paseo-fs-search-content-");
    try {
      await seedTree(root);
      const result = await searchFiles({ root, query: "needle", mode: "content" });
      // .hidden/secret.ts is BOTH hidden and gitignored; the tree shows it, so search finds it.
      expect(paths(result.matches)).toEqual([".hidden/secret.ts", "src/alpha.ts"]);
      expect(result.matches.every((m) => m.kind === "file")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("still skips the heavy generated dirs (node_modules, .git)", async () => {
    const root = await createTempDir("paseo-fs-search-skip-");
    try {
      await seedTree(root);
      const result = await searchFiles({ root, query: "needle", mode: "content" });
      const found = paths(result.matches);
      expect(found).not.toContain("node_modules/pkg/index.js");
      expect(found).not.toContain(".git/objects/blob.txt");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("truncates content results to the limit and flags truncated", async () => {
    const root = await createTempDir("paseo-fs-search-limit-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      for (let i = 0; i < 5; i += 1) {
        await writeFile(path.join(root, `src/file${i}.ts`), "const needle = 1;\n");
      }
      const result = await searchFiles({ root, query: "needle", mode: "content", limit: 2 });
      expect(result.matches.length).toBe(2);
      expect(result.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("scopes content search to basePath", async () => {
    const root = await createTempDir("paseo-fs-search-base-");
    try {
      await seedTree(root);
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "content",
        basePath: "src/inner",
      });
      // alpha.ts (under src, not src/inner) is excluded; nothing under src/inner has "needle" in body.
      expect(result.matches).toEqual([]);
      expect(result.truncated).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a basePath that escapes the root", async () => {
    const root = await createTempDir("paseo-fs-search-escape-");
    try {
      await seedTree(root);
      await expect(
        searchFiles({ root, query: "needle", mode: "content", basePath: ".." }),
      ).rejects.toThrow("Access outside of workspace is not allowed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs search service · content mode (Node fallback)", () => {
  it("finds content matches with line/preview/ranges when ripgrep is unavailable", async () => {
    const root = await createTempDir("paseo-fs-search-node-");
    try {
      await seedTree(root);
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "content",
        forceNodeContentWalk: true,
      });
      expect(paths(result.matches)).toEqual([".hidden/secret.ts", "src/alpha.ts"]);
      expect(result.matches.find((m) => m.path === "src/alpha.ts")).toMatchObject({
        path: "src/alpha.ts",
        kind: "file",
        line: 1,
        preview: "const needle = 1;",
        ranges: [{ start: 6, end: 12 }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips the heavy generated dirs and honors the limit in the Node fallback", async () => {
    const root = await createTempDir("paseo-fs-search-node-skip-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await mkdir(path.join(root, "node_modules"), { recursive: true });
      await writeFile(path.join(root, "node_modules/x.ts"), "const needle = 1;\n");
      for (let i = 0; i < 4; i += 1) {
        await writeFile(path.join(root, `src/f${i}.ts`), "const needle = 1;\n");
      }
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "content",
        limit: 2,
        forceNodeContentWalk: true,
      });
      expect(result.matches.length).toBe(2);
      expect(result.truncated).toBe(true);
      expect(paths(result.matches).some((p) => p.startsWith("node_modules"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("ignores binary files in the Node fallback", async () => {
    const root = await createTempDir("paseo-fs-search-node-bin-");
    try {
      await writeFile(path.join(root, "blob.bin"), Buffer.from([0x6e, 0x00, 0x65]));
      const result = await searchFiles({
        root,
        query: "n",
        mode: "content",
        forceNodeContentWalk: true,
      });
      expect(result.matches).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// The one JSON match line the scripted fake rg binaries emit (a path that does NOT exist in the
// real tree, so assertions can tell "rg result trusted" apart from "fell back to the Node walk").
const FAKE_RG_MATCH_LINE = JSON.stringify({
  type: "match",
  data: {
    path: { text: "src/slow.ts" },
    line_number: 1,
    lines: { text: "needle here\n" },
    submatches: [{ start: 0, end: 6 }],
  },
});

// Write an executable fake `rg` whose behavior is the given shell body; returns its path.
async function writeFakeRg(dir: string, body: string): Promise<string> {
  const bin = path.join(dir, "rg");
  await writeFile(bin, `#!/bin/sh\n${body}\n`);
  await chmod(bin, 0o755);
  return bin;
}

describe("fs search service · ripgrep failure modes", () => {
  it("returns the matches streamed before the deadline (truncated), not a full re-walk", async () => {
    const root = await createTempDir("paseo-fs-search-timeout-");
    const fakeBin = await createTempDir("paseo-fake-rg-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src/real.ts"), "const needle = 1;\n");

      // A fake rg that emits one JSON match, then hangs past the deadline until it is killed.
      const rgBinaryPath = await writeFakeRg(
        fakeBin,
        `printf '%s\\n' '${FAKE_RG_MATCH_LINE}'\nsleep 30`,
      );

      // 1.5s deadline: far above the fake rg's spawn+print latency even on a heavily loaded
      // machine (parallel suites), far below its 30s hang — deterministic either way. The test
      // always runs to the deadline (rg hangs after printing), so this is also its runtime.
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "content",
        rgTimeoutMs: 1500,
        rgBinaryPath,
      });

      expect(paths(result.matches)).toEqual(["src/slow.ts"]);
      expect(result.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  });

  it("trusts structured output on exit code 2 (per-file errors) instead of re-walking", async () => {
    const root = await createTempDir("paseo-fs-search-exit2-");
    const fakeBin = await createTempDir("paseo-fake-rg-exit2-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src/real.ts"), "const needle = 1;\n");

      // rg exits 2 whenever ANY file was unreadable — near-certain on a wide root — while its
      // matches over the readable set are complete. The fake reproduces exactly that shape.
      const rgBinaryPath = await writeFakeRg(
        fakeBin,
        `printf '%s\\n' '${FAKE_RG_MATCH_LINE}'\nexit 2`,
      );

      const result = await searchFiles({ root, query: "needle", mode: "content", rgBinaryPath });

      expect(paths(result.matches)).toEqual(["src/slow.ts"]);
      expect(result.truncated).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(fakeBin, { recursive: true, force: true });
    }
  });

  it("falls back to the Node walk when the rg binary cannot run at all", async () => {
    const root = await createTempDir("paseo-fs-search-norg-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src/real.ts"), "const needle = 1;\n");

      const result = await searchFiles({
        root,
        query: "needle",
        mode: "content",
        rgBinaryPath: path.join(root, "definitely-not-a-binary"),
      });

      expect(paths(result.matches)).toEqual(["src/real.ts"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs search service · progressive delivery + abort", () => {
  it("streams onMatches batches while scanning, and the final result carries the complete set", async () => {
    const root = await createTempDir("paseo-fs-search-stream-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      for (let i = 0; i < 30; i += 1) {
        await writeFile(path.join(root, `src/needle${i}.ts`), "x\n");
      }
      const batches: string[][] = [];
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "name",
        onMatches: (matches) => batches.push(matches.map((m) => m.path)),
      });
      // Every match reached the stream (batched), and the final set matches the stream's union.
      expect(batches.length).toBeGreaterThanOrEqual(1);
      expect(batches.flat().sort()).toEqual(paths(result.matches));
      expect(result.matches.length).toBe(30);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("an aborted walk stops early and resolves truncated (supersede, not an error)", async () => {
    const root = await createTempDir("paseo-fs-search-abort-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      for (let i = 0; i < 200; i += 1) {
        await writeFile(path.join(root, `src/needle${i}.ts`), "x\n");
      }
      const controller = new AbortController();
      // Abort as soon as the first match streams out — the walk must stop, not finish the tree.
      const result = await searchFiles({
        root,
        query: "needle",
        mode: "name",
        signal: controller.signal,
        onMatches: () => controller.abort(),
      });
      expect(result.truncated).toBe(true);
      expect(result.matches.length).toBeLessThan(200);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("fs search service · name mode", () => {
  it("finds files and directories whose names contain the query", async () => {
    const root = await createTempDir("paseo-fs-search-name-");
    try {
      await seedTree(root);
      const result = await searchFiles({ root, query: "needle", mode: "name" });
      // Only the file whose NAME contains "needle"; bodies are ignored in name mode.
      expect(paths(result.matches)).toEqual(["src/inner/needle-name.txt"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("finds hidden entries by name (the tree displays them, so search covers them)", async () => {
    const root = await createTempDir("paseo-fs-search-name-hidden-");
    try {
      await seedTree(root);
      const byDirName = await searchFiles({ root, query: "hidden", mode: "name" });
      expect(paths(byDirName.matches)).toEqual([".hidden"]);
      const byFileName = await searchFiles({ root, query: "secret", mode: "name" });
      expect(paths(byFileName.matches)).toEqual([".hidden/secret.ts"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("matches directory names too", async () => {
    const root = await createTempDir("paseo-fs-search-name-dir-");
    try {
      await mkdir(path.join(root, "widgets"), { recursive: true });
      await writeFile(path.join(root, "widgets/a.ts"), "x\n");
      const result = await searchFiles({ root, query: "widget", mode: "name" });
      expect(result.matches).toEqual([{ path: "widgets", kind: "directory" }]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("truncates name results to the limit", async () => {
    const root = await createTempDir("paseo-fs-search-name-limit-");
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      for (let i = 0; i < 5; i += 1) {
        await writeFile(path.join(root, `src/needle${i}.ts`), "x\n");
      }
      const result = await searchFiles({ root, query: "needle", mode: "name", limit: 3 });
      expect(result.matches.length).toBe(3);
      expect(result.truncated).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
