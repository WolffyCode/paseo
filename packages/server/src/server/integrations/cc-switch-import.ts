import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { v4 as uuidv4 } from "uuid";
import equal from "fast-deep-equal";
import type { Vendor, VendorModel } from "@getpaseo/protocol/provider-config";
import type { CcSwitchSyncItem as ProtocolCcSwitchSyncItem } from "@getpaseo/protocol/messages";

// ESM-safe require: node:sqlite is loaded via CJS require because it ships as a built-in
// CJS module in Node 22 and has no stable ESM entry. createRequire(import.meta.url) gives
// us a require() that works in the compiled ESM daemon (bare `require` is undefined in ESM).
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface VendorCandidate {
  source: { kind: "cc-switch"; id: string };
  name: string;
  cli: "claude" | "codex";
  apiFormat: "anthropic" | "openai";
  baseUrl: string;
  apiKey?: string;
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key";
  models: VendorModel[];
  websiteUrl?: string;
  notes?: string;
  configJson?: Record<string, unknown>;
  order?: number;
}

export type CcSwitchSyncItem = ProtocolCcSwitchSyncItem;

// ---------------------------------------------------------------------------
// Default db path
// ---------------------------------------------------------------------------

export function defaultCcSwitchDbPath(): string {
  return join(homedir(), ".cc-switch", "cc-switch.db");
}

// ---------------------------------------------------------------------------
// Minimal inline types for node:sqlite (available Node 22.5+)
// @types/node ^20 does not include sqlite.d.ts
// ---------------------------------------------------------------------------

interface DatabaseSyncStatement {
  all(...params: unknown[]): unknown[];
}

interface DatabaseSyncInstance {
  prepare(sql: string): DatabaseSyncStatement;
  exec(sql: string): void;
  close(): void;
}

interface DatabaseSyncConstructor {
  new (path: string, options?: { readOnly?: boolean }): DatabaseSyncInstance;
}

interface NodeSqliteModule {
  DatabaseSync: DatabaseSyncConstructor;
}

// ---------------------------------------------------------------------------
// Row shape returned from SQLite
// ---------------------------------------------------------------------------

interface ProviderRow {
  id: string;
  name: string;
  settings_config: string;
  website_url: string | null;
  notes: string | null;
  sort_index: number | null;
}

// ---------------------------------------------------------------------------
// readCcSwitchVendors — pure; dbPath injected for testability
// ---------------------------------------------------------------------------

export function readCcSwitchVendors(dbPath: string, cli: "claude" | "codex"): VendorCandidate[] {
  const { DatabaseSync } = require("node:sqlite") as NodeSqliteModule;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let rows: ProviderRow[];
  try {
    rows = db
      .prepare(
        "SELECT id, name, website_url, notes, sort_index, settings_config FROM providers WHERE app_type=?",
      )
      .all(cli) as ProviderRow[];
  } finally {
    db.close();
  }

  return rows.map((row) => mapRow(row, cli));
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapRow(row: ProviderRow, cli: "claude" | "codex"): VendorCandidate {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.settings_config) as Record<string, unknown>;
  } catch {
    // malformed JSON: treat as empty
  }

  const base: Pick<
    VendorCandidate,
    "source" | "name" | "cli" | "configJson" | "websiteUrl" | "notes" | "order"
  > = {
    source: { kind: "cc-switch", id: row.id },
    name: row.name ?? row.id,
    cli,
    configJson: config,
    websiteUrl: row.website_url ?? undefined,
    notes: row.notes ?? undefined,
    order: row.sort_index ?? undefined,
  };

  if (cli === "claude") {
    return mapClaudeRow(base, config);
  }
  return mapCodexRow(base, config);
}

function mapClaudeRow(
  base: Pick<
    VendorCandidate,
    "source" | "name" | "cli" | "configJson" | "websiteUrl" | "notes" | "order"
  >,
  config: Record<string, unknown>,
): VendorCandidate {
  const env = (config.env as Record<string, string> | undefined) ?? {};
  const baseUrl = (env.ANTHROPIC_BASE_URL ?? "") as string;

  // Auth style: prefer ANTHROPIC_AUTH_TOKEN, fall back to ANTHROPIC_API_KEY
  let apiKey: string | undefined;
  let authStyle: VendorCandidate["authStyle"];
  if (env.ANTHROPIC_AUTH_TOKEN) {
    apiKey = env.ANTHROPIC_AUTH_TOKEN;
    authStyle = "anthropic-auth-token";
  } else if (env.ANTHROPIC_API_KEY) {
    apiKey = env.ANTHROPIC_API_KEY;
    authStyle = "anthropic-api-key";
  } else {
    authStyle = "anthropic-auth-token"; // default
  }

  // Collect model seeds — deduplicate, preserve order
  const modelSeedSources: (string | undefined)[] = [
    env.ANTHROPIC_MODEL,
    env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    env.ANTHROPIC_REASONING_MODEL,
    typeof config.model === "string" ? config.model : undefined,
  ];
  const seen = new Set<string>();
  const models: VendorModel[] = [];
  for (const id of modelSeedSources) {
    if (id && !seen.has(id)) {
      seen.add(id);
      models.push({ id, source: "cc-switch" });
    }
  }

  return {
    ...base,
    apiFormat: "anthropic",
    baseUrl,
    apiKey,
    authStyle,
    models,
  };
}

function mapCodexRow(
  base: Pick<
    VendorCandidate,
    "source" | "name" | "cli" | "configJson" | "websiteUrl" | "notes" | "order"
  >,
  config: Record<string, unknown>,
): VendorCandidate {
  const auth = (config.auth as Record<string, string> | undefined) ?? {};
  const apiKey = auth.OPENAI_API_KEY;
  const configStr = typeof config.config === "string" ? config.config : "";

  // Best-effort: extract base_url from TOML string
  const match = /base_url\s*=\s*"([^"]+)"/.exec(configStr);
  const baseUrl = match ? match[1] : "";

  return {
    ...base,
    apiFormat: "openai",
    baseUrl,
    apiKey,
    authStyle: "openai-api-key",
    models: [], // codex model list fetched separately
  };
}

// ---------------------------------------------------------------------------
// diffAgainstExisting — pure
// ---------------------------------------------------------------------------

/** Fields that constitute the "synced" data from cc-switch (changes trigger "update") */
function extractSyncedFields(
  v: VendorCandidate | Vendor,
): Pick<VendorCandidate, "baseUrl" | "apiKey" | "configJson" | "models"> {
  return {
    baseUrl: v.baseUrl,
    apiKey: "apiKey" in v ? (v as VendorCandidate).apiKey : (v as Vendor).apiKey,
    configJson: v.configJson,
    models: "models" in v ? (v.models ?? []) : [],
  };
}

export function diffAgainstExisting(
  candidates: VendorCandidate[],
  existing: Vendor[],
): CcSwitchSyncItem[] {
  return candidates.map((cand) => {
    const match = existing.find(
      (v) => v.source?.kind === "cc-switch" && v.source.id === cand.source.id,
    );

    let status: CcSwitchSyncItem["status"];
    if (!match) {
      status = "new";
    } else {
      const candFields = extractSyncedFields(cand);
      const existingFields: Pick<VendorCandidate, "baseUrl" | "apiKey" | "configJson" | "models"> =
        {
          baseUrl: match.baseUrl,
          apiKey: match.apiKey,
          configJson: match.configJson,
          models: match.models ?? [],
        };
      status = equal(candFields, existingFields) ? "same" : "update";
    }

    return {
      ccSwitchId: cand.source.id,
      name: cand.name,
      baseUrl: cand.baseUrl,
      status,
      modelCount: cand.models.length,
    };
  });
}

// ---------------------------------------------------------------------------
// applyCcSwitchSync — pure; returns new vendors array
// ---------------------------------------------------------------------------

export function applyCcSwitchSync(
  candidates: VendorCandidate[],
  existing: Vendor[],
  selectedIds: string[],
): Vendor[] {
  const selectedSet = new Set(selectedIds);

  // Build a map of cc-switch id -> existing vendor for O(1) lookup
  const existingByCcId = new Map<string, Vendor>();
  for (const v of existing) {
    if (v.source?.kind === "cc-switch") {
      existingByCcId.set(v.source.id, v);
    }
  }

  // Start with a copy of all existing vendors (we will mutate some in-place below)
  const resultMap = new Map<string, Vendor>();
  for (const v of existing) {
    resultMap.set(v.id, v);
  }

  for (const cand of candidates) {
    if (!selectedSet.has(cand.source.id)) {
      // Not selected: leave existing alone (or skip if new)
      continue;
    }

    const existingVendor = existingByCcId.get(cand.source.id);
    if (existingVendor) {
      // UPDATE: refresh synced fields, preserve local fields
      const updated: Vendor = {
        ...existingVendor,
        // Synced fields from cc-switch:
        name: cand.name,
        baseUrl: cand.baseUrl,
        apiKey: cand.apiKey,
        apiFormat: cand.apiFormat,
        authStyle: cand.authStyle,
        configJson: cand.configJson,
        models: cand.models,
        websiteUrl: cand.websiteUrl,
        notes: cand.notes,
        // Local fields are preserved from existingVendor (spread above):
        // id, order, enabled, exposedModelIds, defaultModelId, modelsFetchedAt
      };
      resultMap.set(existingVendor.id, updated);
    } else {
      // NEW: create a fresh Vendor
      const newId = `vnd_${uuidv4()}`;
      const newVendor: Vendor = {
        id: newId,
        name: cand.name,
        baseUrl: cand.baseUrl,
        apiKey: cand.apiKey,
        apiFormat: cand.apiFormat,
        authStyle: cand.authStyle,
        configJson: cand.configJson,
        models: cand.models,
        websiteUrl: cand.websiteUrl,
        notes: cand.notes,
        order: cand.order,
        source: cand.source,
        enabled: true,
        // For claude: expose all seed models by default; for codex: leave empty
        exposedModelIds:
          cand.cli === "claude" && cand.models.length > 0
            ? cand.models.map((m) => m.id)
            : undefined,
      };
      resultMap.set(newId, newVendor);
    }
  }

  return Array.from(resultMap.values());
}
