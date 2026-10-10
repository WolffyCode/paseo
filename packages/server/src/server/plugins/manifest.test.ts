import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readPluginManifest } from "./manifest.js";
import { loadPlatformPackage } from "./platform/package.js";
import {
  platformManifest,
  platformService,
  writePlatformPackage,
} from "./test-fixtures/platform-package.js";

const directories: string[] = [];
const examplesDirectory = fileURLToPath(
  new URL("../../../../../plugin-examples/", import.meta.url),
);
const examples = (await readdir(examplesDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("plugin manifest", () => {
  it.each([0, 2, "1", null])(
    "rejects unsupported manifest markers: %j",
    async (manifestVersion) => {
      const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-version-"));
      directories.push(directory);
      await writeFile(
        path.join(directory, "paseo-plugin.json"),
        JSON.stringify({ id: "example", manifestVersion }),
      );
      await expect(readPluginManifest(directory)).rejects.toThrow();
    },
  );

  it("rejects executable resource packages and duplicate consumer bindings", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-invalid-v1-"));
    directories.push(directory);
    const manifest = platformManifest({ kind: "resource" });
    await writeFile(path.join(directory, "paseo-plugin.json"), JSON.stringify(manifest));
    await expect(readPluginManifest(directory)).rejects.toThrow("Resource packages cannot");
    manifest.kind = "code";
    const dependency = {
      bindingKey: "missing",
      serviceId: "acme.missing",
      range: "^1.0.0",
      optional: true,
      runtime: "daemon",
      scope: "host",
      consumer: { kind: "provider", id: "files" },
      activation: "eager",
    };
    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ ...manifest, requires: [dependency, dependency] }),
    );
    await expect(readPluginManifest(directory)).rejects.toThrow("Duplicate consumer binding key");
  });

  it("includes transitive packaged schemas in the digest and ignores formatting", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-refs-"));
    directories.push(directory);
    const service = platformService();
    service.methods.read!.output = { $ref: "./name.json" };
    const manifest = await writePlatformPackage({ directory, service });
    const schema = { $id: "https://acme.example/name", type: "string", minLength: 1 };
    const schemaFile = path.join(directory, "shared/name.json");
    await writeFile(schemaFile, JSON.stringify(schema));
    const input = { directory, manifest, daemonVersion: "0.11.1", origin: "configured" as const };
    const first = await loadPlatformPackage(input);
    await writeFile(schemaFile, JSON.stringify(schema, null, 2));
    expect((await loadPlatformPackage(input)).services[0]!.schemaDigest).toBe(
      first.services[0]!.schemaDigest,
    );
    await writeFile(schemaFile, JSON.stringify({ ...schema, minLength: 2 }));
    expect((await loadPlatformPackage(input)).services[0]!.schemaDigest).not.toBe(
      first.services[0]!.schemaDigest,
    );
  });

  it("keeps literal reference-looking data out of schema loading", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-literal-"));
    directories.push(directory);
    const service = platformService();
    service.methods.read!.output = {
      type: "object",
      const: { $ref: "https://unavailable.example/literal" },
    };
    const manifest = await writePlatformPackage({ directory, service });
    await expect(
      loadPlatformPackage({ directory, manifest, daemonVersion: "0.11.1", origin: "configured" }),
    ).resolves.toMatchObject({ extensions: [] });
  });

  it.each(["../../outside.json", "https://unavailable.example/schema.json"])(
    "rejects a schema reference outside the package: %s",
    async (reference) => {
      const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-escape-"));
      directories.push(directory);
      const service = platformService();
      service.methods.read!.output = { $ref: reference };
      const manifest = await writePlatformPackage({ directory, service });
      await expect(
        loadPlatformPackage({ directory, manifest, daemonVersion: "0.11.1", origin: "configured" }),
      ).rejects.toThrow();
    },
  );

  it("loads and validates a packaged service contract without executing its entry", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-contract-"));
    directories.push(directory);
    const manifest = await writePlatformPackage({ directory });
    const loaded = await loadPlatformPackage({
      directory,
      manifest,
      daemonVersion: "0.11.1",
      origin: "configured",
    });
    expect(loaded.package).toEqual({ name: "@acme/files", version: "1.0.0" });
    expect(loaded.services.map((service) => service.definition.serviceId)).toEqual(["acme.files"]);
    expect(loaded.services[0]!.schemaDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("preserves the v1 contract declarations without treating them as a legacy plugin", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    const manifest = {
      manifestVersion: 1,
      packageId: "acme/contracts",
      id: "contracts",
      name: "Contracts",
      kind: "resource",
      requirements: { paseo: ">=0.11.1", helmPlatform: "^1.0.0" },
      runtimes: {},
      contracts: [],
      extensionPoints: [],
      provides: [],
      requires: [],
      contributions: [],
      settings: [],
      states: [],
    };
    await writeFile(path.join(directory, "paseo-plugin.json"), JSON.stringify(manifest));
    await expect(readPluginManifest(directory)).resolves.toEqual(manifest);
  });

  it.each(examples)("validates the %s example manifest", async (name) => {
    await expect(readPluginManifest(path.join(examplesDirectory, name))).resolves.toMatchObject({
      id: expect.any(String),
    });
  });

  it("reads display metadata and ignores future top-level fields", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    const manifest = {
      id: "review",
      name: "Review tools",
      icon: "assets/icon.png",
      media: ["assets/screenshot.webp", "demo.mp4", "https://example.com/media?id=1"],
    };
    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ ...manifest, futureField: { enabled: true } }),
    );
    await expect(readPluginManifest(directory)).resolves.toEqual(manifest);
  });

  it.each([
    { name: "   " },
    { name: 42 },
    { icon: "" },
    { icon: 42 },
    { icon: "icon.svg" },
    { icon: "/icon.png" },
    { icon: "../icon.png" },
    { icon: "assets/../../icon.png" },
    { icon: "https://example.com/icon.png" },
    { icon: "C:/icon.png" },
    { icon: "assets\\icon.png" },
    { icon: "icon.png?query" },
    { media: "screenshot.png" },
    { media: [42] },
    { media: [""] },
    { media: ["../demo.mp4"] },
    { media: ["/demo.mp4"] },
    { media: ["http://example.com/demo.mp4"] },
    { media: ["https://"] },
    { media: ["//example.com/demo.mp4"] },
    { media: ["file:///demo.mp4"] },
    { media: ["data:image/png;base64,abc"] },
    { media: ["."] },
    { media: ["assets/"] },
    { id: "INVALID" },
    { description: 42 },
    { requirements: { paseoo: ">=0.11.0" } },
  ])("rejects invalid known fields: %j", async (fields) => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ id: "example", futureField: true, ...fields }),
    );
    await expect(readPluginManifest(directory)).rejects.toThrow();
  });

  it("accepts omitted metadata and empty media", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    for (const manifest of [{ id: "example" }, { id: "example", media: [] }]) {
      await writeFile(path.join(directory, "paseo-plugin.json"), JSON.stringify(manifest));
      await expect(readPluginManifest(directory)).resolves.toEqual(manifest);
    }
  });

  it("reads and validates requirements before any plugin code runs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    const manifest = path.join(directory, "paseo-plugin.json");
    await writeFile(manifest, JSON.stringify({ id: "example", requirements: { paseo: "^0.8.0" } }));
    await expect(readPluginManifest(directory)).resolves.toEqual({
      id: "example",
      requirements: { paseo: "^0.8.0" },
    });
    for (const requirements of [
      { paseo: "latest" },
      { paseo: "" },
      { paseo: 8 },
      { node: ">=20" },
      "0.8.0",
    ]) {
      await writeFile(manifest, JSON.stringify({ id: "example", requirements }));
      await expect(readPluginManifest(directory)).rejects.toThrow();
    }
  });

  it("reads an optional description", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ id: "described", description: "Reviews changes before merge" }),
    );

    await expect(readPluginManifest(directory)).resolves.toEqual({
      id: "described",
      description: "Reviews changes before merge",
    });

    await writeFile(
      path.join(directory, "paseo-plugin.json"),
      JSON.stringify({ id: "described", description: "   " }),
    );
    await expect(readPluginManifest(directory)).rejects.toThrow();
  });

  it("accepts only non-empty argv arrays for build commands", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "paseo-plugin-manifest-"));
    directories.push(directory);
    const manifest = path.join(directory, "paseo-plugin.json");

    await writeFile(
      manifest,
      JSON.stringify({ id: "prepared", build: [["pnpm", "install", "--frozen-lockfile"]] }),
    );
    await expect(readPluginManifest(directory)).resolves.toMatchObject({
      build: [["pnpm", "install", "--frozen-lockfile"]],
    });

    for (const build of [[], [[]], [["pnpm", ""]], [["pnpm", 1]], "pnpm install"]) {
      await writeFile(manifest, JSON.stringify({ id: "prepared", build }));
      await expect(readPluginManifest(directory)).rejects.toThrow();
    }
  });
});
