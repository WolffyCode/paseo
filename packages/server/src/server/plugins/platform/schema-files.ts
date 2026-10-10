import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import { fullFormats } from "ajv-formats/dist/formats.js";
import stableStringify from "fast-json-stable-stringify";
import valid from "semver/functions/valid.js";
import validRange from "semver/ranges/valid.js";
import { PlatformJsonSchema, PlatformPathSchema } from "@getpaseo/protocol/plugin-platform";
import { PluginPlatformError } from "@getpaseo/protocol/plugin-platform-validation";

interface SchemaFile {
  id: string;
  file: string;
  value: Record<string, unknown>;
  dependencies: Set<string>;
  metadata: boolean;
}
interface SchemaReference {
  reference: string;
  base: string;
}

export function platformDigest(value: unknown): string {
  return "sha256:" + createHash("sha256").update(stableStringify(value)).digest("hex");
}

function references(value: unknown, base: string, localIds: Set<string>): SchemaReference[] {
  if (typeof value !== "object" || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => references(item, base, localIds));
  const record = PlatformJsonSchema.parse(value);
  const currentBase = typeof record.$id === "string" ? new URL(record.$id, base).href : base;
  if (typeof record.$id === "string") localIds.add(currentBase);
  const found: SchemaReference[] = [];
  if (typeof record.$ref === "string") found.push({ reference: record.$ref, base: currentBase });
  for (const keyword of [
    "$defs",
    "definitions",
    "properties",
    "patternProperties",
    "dependentSchemas",
  ]) {
    const children = record[keyword];
    if (typeof children === "object" && children !== null)
      for (const child of Object.values(children))
        found.push(...references(child, currentBase, localIds));
  }
  for (const keyword of [
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems",
    "items",
    "additionalItems",
    "contains",
    "additionalProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
    "unevaluatedProperties",
    "unevaluatedItems",
    "contentSchema",
  ]) {
    found.push(...references(record[keyword], currentBase, localIds));
  }
  return found;
}

interface SchemaMember {
  pointer: string;
  schema: Record<string, unknown>;
}

function schemaMembers(document: SchemaFile): SchemaMember[] {
  if ("dataSchema" in document.value)
    return [
      { pointer: "/dataSchema", schema: PlatformJsonSchema.parse(document.value.dataSchema) },
    ];
  const found: SchemaMember[] = [];
  for (const key of ["methods", "events", "interceptors"]) {
    const members = document.value[key];
    if (typeof members !== "object" || members === null) continue;
    for (const [name, member] of Object.entries(members)) {
      const fields = PlatformJsonSchema.parse(member);
      for (const field of ["input", "output", "payload", "snapshotSchema", "deltaSchema"]) {
        if (fields[field] !== undefined)
          found.push({
            pointer: `/${key}/${name}/${field}`,
            schema: PlatformJsonSchema.parse(fields[field]),
          });
      }
    }
  }
  return found;
}

export class PluginSchemaFiles {
  private readonly files = new Map<string, SchemaFile>();
  private readonly documents = new Map<string, SchemaFile>();
  private readonly aliases = new Map<string, string>();
  private readonly expanded = new Set<string>();
  private readonly ajv = new Ajv2020({ allErrors: true, strictTypes: false });
  private readonly validators = new Map<string, ValidateFunction<unknown>>();
  private readonly memberIds = new Map<string, string>();
  private bytes = 0;

  constructor(
    private readonly root: string,
    private readonly packageId: string,
  ) {
    for (const [name, format] of Object.entries(fullFormats)) this.ajv.addFormat(name, format);
    this.ajv.addFormat("semver", (value) => valid(value) === value);
    this.ajv.addFormat("semver-range", (value) => validRange(value) !== null);
  }

  async asset(relative: string): Promise<string> {
    PlatformPathSchema.parse(relative);
    const canonicalRoot = await realpath(this.root);
    const file = await realpath(path.resolve(this.root, relative));
    const location = path.relative(canonicalRoot, file);
    const outside =
      location === ".." || location.startsWith(".." + path.sep) || path.isAbsolute(location);
    if (outside)
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Package asset escapes its root: ${relative}`,
      });
    const info = await stat(file);
    if (!info.isFile())
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Package asset is not a file: ${relative}`,
      });
    return file;
  }

  async read(relative: string): Promise<SchemaFile> {
    const file = await this.asset(relative);
    const existing = this.files.get(file);
    if (existing) return existing;
    const info = await stat(file);
    this.bytes += info.size;
    if (info.size > 1_048_576 || this.bytes > 4_194_304 || this.files.size >= 128) {
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: "Plugin schema files exceed the discovery limit",
      });
    }
    const input: unknown = JSON.parse(await readFile(file, "utf8"));
    const value = PlatformJsonSchema.parse(input);
    const relativeId = relative.split("/").map(encodeURIComponent).join("/");
    const fallbackId = `https://helm.spec/packages/${this.packageId}/${relativeId}`;
    const id = typeof value.$id === "string" ? new URL(value.$id).href : fallbackId;
    if (id.includes("#"))
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: "Schema document IDs cannot contain a fragment",
      });
    const duplicate = this.documents.get(id);
    if (duplicate && platformDigest(duplicate.value) !== platformDigest(value)) {
      throw new PluginPlatformError({
        code: "CONTRACT_CONFLICT",
        message: `Conflicting schema document ID: ${id}`,
      });
    }
    const document: SchemaFile = { file, value, id, dependencies: new Set(), metadata: false };
    this.files.set(file, document);
    if (!duplicate) this.documents.set(id, document);
    return document;
  }

  async readMetadata(relative: string): Promise<SchemaFile> {
    const document = await this.read(relative);
    document.metadata = true;
    return document;
  }

  async prepare(): Promise<void> {
    for (const document of this.documents.values()) await this.expand(document);
    for (const document of this.documents.values())
      if (!document.metadata) this.ajv.addSchema(document.value, document.id);
    // Contract metadata is not JSON Schema. Each input/output is its own schema root.
    for (const document of this.documents.values()) {
      if (!document.metadata) continue;
      for (const member of schemaMembers(document)) {
        const id = document.id + "?schema=" + encodeURIComponent(member.pointer);
        this.ajv.addSchema({ $id: id, ...member.schema }, id);
        this.memberIds.set(document.id + "#" + member.pointer, id);
      }
    }
    for (const [alias, id] of this.aliases) {
      if (alias !== id && !this.documents.has(alias)) this.ajv.addSchema({ $ref: id }, alias);
    }
  }

  private async expand(document: SchemaFile): Promise<void> {
    if (this.expanded.has(document.file)) return;
    this.expanded.add(document.file);
    const localIds = new Set([document.id]);
    const roots = document.metadata
      ? schemaMembers(document).map((member) => member.schema)
      : [document.value];
    const dependencies = roots.flatMap((schema) => references(schema, document.id, localIds));
    for (const reference of dependencies) {
      const url = new URL(reference.reference, reference.base);
      url.hash = "";
      if (localIds.has(url.href)) continue;
      let dependency = this.documents.get(url.href);
      if (!dependency) dependency = await this.readReference(document, reference.reference);
      const existingAlias = this.aliases.get(url.href);
      if (existingAlias && existingAlias !== dependency.id) {
        throw new PluginPlatformError({
          code: "CONTRACT_CONFLICT",
          message: `Conflicting reference: ${url.href}`,
        });
      }
      this.aliases.set(url.href, dependency.id);
      document.dependencies.add(dependency.id);
      await this.expand(dependency);
    }
  }

  private async readReference(document: SchemaFile, reference: string): Promise<SchemaFile> {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//");
    if (absolute || reference.startsWith("#")) {
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Schema reference is not packaged: ${reference}`,
      });
    }
    const local = new URL(reference, pathToFileURL(document.file));
    local.hash = "";
    if (local.search)
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: "Schema file references cannot contain a query",
      });
    const canonicalRoot = await realpath(this.root);
    const relative = path.relative(canonicalRoot, fileURLToPath(local)).split(path.sep).join("/");
    return this.read(relative);
  }

  compile(id: string): void {
    this.validator(id);
  }

  validate(id: string, value: unknown): void {
    const problem = this.check(id, value);
    if (problem) {
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Schema validation failed for ${id}: ${problem}`,
      });
    }
  }

  /** Returns the validation failure text, or null when the value matches the schema. */
  check(id: string, value: unknown): string | null {
    const validate = this.validator(id);
    return validate(value) ? null : this.ajv.errorsText(validate.errors);
  }

  private validator(id: string): ValidateFunction<unknown> {
    const cached = this.validators.get(id);
    if (cached) return cached;
    const validate = this.ajv.getSchema<unknown>(this.memberIds.get(id) ?? id);
    if (!validate)
      throw new PluginPlatformError({
        code: "INVALID_CONTRACT",
        message: `Schema is unavailable: ${id}`,
      });
    this.validators.set(id, validate);
    return validate;
  }

  digest(document: SchemaFile): string {
    const visited = new Map<string, Record<string, unknown>>();
    const pending = [...document.dependencies];
    while (pending.length) {
      const id = pending.pop()!;
      if (id === document.id || visited.has(id)) continue;
      const dependency = this.documents.get(id);
      if (!dependency)
        throw new PluginPlatformError({
          code: "INVALID_CONTRACT",
          message: `Missing referenced schema: ${id}`,
        });
      visited.set(id, dependency.value);
      pending.push(...dependency.dependencies);
    }
    return platformDigest({ contract: document.value, schemas: Object.fromEntries(visited) });
  }
}
