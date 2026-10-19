import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-log/main", () => ({ default: { warn: vi.fn() } }));

const { DisabledExtensions } = await import("./disabled-extensions.js");

describe("DisabledExtensions", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "disabled-extensions-"));
    filePath = path.join(directory, "states", "disabled.json");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("starts empty without a file", async () => {
    const disabled = new DisabledExtensions<{ name: string }>(filePath);
    await disabled.load();
    expect(disabled.list()).toEqual([]);
  });

  it("remembers turned-off extensions across loads", async () => {
    const first = new DisabledExtensions<{ name: string }>(filePath);
    await first.load();
    await first.add("ext-a", { summary: { name: "A" }, extensionPath: "/x/ext-a/1.0_0" });
    await first.add("ext-b", { summary: { name: "B" }, extensionPath: "/x/ext-b/2.0_0" });
    await first.delete("ext-a");

    const second = new DisabledExtensions<{ name: string }>(filePath);
    await second.load();
    expect(second.has("ext-a")).toBe(false);
    expect(second.get("ext-b")).toEqual({
      summary: { name: "B" },
      extensionPath: "/x/ext-b/2.0_0",
    });
  });

  it("treats a damaged file as empty instead of failing the browser start", async () => {
    const disabled = new DisabledExtensions<{ name: string }>(filePath);
    await disabled.add("ext-a", { summary: { name: "A" }, extensionPath: "/x" });
    await writeFile(filePath, "{not json");

    const reloaded = new DisabledExtensions<{ name: string }>(filePath);
    await reloaded.load();
    expect(reloaded.list()).toEqual([]);
    expect(await readFile(filePath, "utf8")).toBe("{not json");
  });
});
