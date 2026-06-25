import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readCcSwitchVendors, diffAgainstExisting, applyCcSwitchSync } from "./cc-switch-import.js";
import { VendorSchema } from "@getpaseo/protocol/provider-config";
import type { Vendor } from "@getpaseo/protocol/provider-config";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Fixture DB helpers
// ---------------------------------------------------------------------------

interface DatabaseSyncLike {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): void };
  close(): void;
}

function createFixtureDb(dbPath: string): void {
  // Use node:sqlite to build a minimal cc-switch.db fixture
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (p: string) => DatabaseSyncLike;
  };
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE providers (
      id TEXT NOT NULL,
      app_type TEXT NOT NULL,
      name TEXT,
      settings_config TEXT,
      website_url TEXT,
      notes TEXT,
      sort_index INTEGER,
      PRIMARY KEY (id, app_type)
    )
  `);

  // claude provider with the real empirical settings_config shape
  const claudeSettings = JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: "https://claude-proxy.example.com",
      ANTHROPIC_AUTH_TOKEN: "sk-ant-token-abc",
      ANTHROPIC_MODEL: "claude-opus-4-5",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4-5",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4-5",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-3-5",
      ANTHROPIC_REASONING_MODEL: "claude-opus-4-5-reasoning",
    },
    model: "claude-opus-4-5",
    skipDangerousModePermissionPrompt: true,
  });

  // codex provider with TOML config string
  const codexSettings = JSON.stringify({
    auth: { OPENAI_API_KEY: "sk-openai-key-xyz" },
    config: `model = "gpt-4o"\nbase_url = "https://codex-proxy.example.com"\nsome_other = "value"`,
  });

  db.prepare(
    "INSERT INTO providers (id, app_type, name, settings_config, website_url, notes, sort_index) VALUES (?,?,?,?,?,?,?)",
  ).run(
    "provider-claude-1",
    "claude",
    "My Claude Proxy",
    claudeSettings,
    "https://example.com",
    "test notes",
    1,
  );

  db.prepare(
    "INSERT INTO providers (id, app_type, name, settings_config, website_url, notes, sort_index) VALUES (?,?,?,?,?,?,?)",
  ).run("provider-codex-1", "codex", "My Codex Proxy", codexSettings, null, null, 2);

  // gemini provider — should NOT be imported
  db.prepare(
    "INSERT INTO providers (id, app_type, name, settings_config, website_url, notes, sort_index) VALUES (?,?,?,?,?,?,?)",
  ).run("provider-gemini-1", "gemini", "Gemini Provider", "{}", null, null, 3);

  db.close();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tmpDbPath: string;

beforeEach(() => {
  tmpDbPath = join(tmpdir(), `cc-switch-test-${Date.now()}.db`);
  createFixtureDb(tmpDbPath);
});

afterEach(() => {
  try {
    rmSync(tmpDbPath, { force: true });
  } catch {
    // ignore
  }
});

describe("readCcSwitchVendors — claude", () => {
  it("maps baseUrl, apiKey, authStyle from env fields", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.source).toEqual({ kind: "cc-switch", id: "provider-claude-1" });
    expect(c.name).toBe("My Claude Proxy");
    expect(c.cli).toBe("claude");
    expect(c.apiFormat).toBe("anthropic");
    expect(c.baseUrl).toBe("https://claude-proxy.example.com");
    expect(c.apiKey).toBe("sk-ant-token-abc");
    expect(c.authStyle).toBe("anthropic-auth-token");
    expect(c.websiteUrl).toBe("https://example.com");
    expect(c.notes).toBe("test notes");
    expect(c.order).toBe(1);
  });

  it("deduplicates and collects model seeds", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const c = candidates[0];
    // models come from env + top-level model field; "claude-opus-4-5" appears 3x but deduped
    expect(c.models).toBeDefined();
    const ids = (c.models ?? []).map((m) => m.id);
    // Should have: claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5, claude-opus-4-5-reasoning
    // claude-opus-4-5 appears in ANTHROPIC_MODEL, ANTHROPIC_DEFAULT_OPUS_MODEL, and top-level model
    // After dedup: 4 unique ids
    expect(ids).toContain("claude-opus-4-5");
    expect(ids).toContain("claude-sonnet-4-5");
    expect(ids).toContain("claude-haiku-3-5");
    expect(ids).toContain("claude-opus-4-5-reasoning");
    // No duplicates
    expect(ids.length).toBe(new Set(ids).size);
    // All have source: "cc-switch"
    for (const m of c.models ?? []) {
      expect(m.source).toBe("cc-switch");
    }
  });
});

describe("readCcSwitchVendors — codex", () => {
  it("maps apiKey and extracts baseUrl from TOML config string", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "codex");
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.source).toEqual({ kind: "cc-switch", id: "provider-codex-1" });
    expect(c.name).toBe("My Codex Proxy");
    expect(c.cli).toBe("codex");
    expect(c.apiFormat).toBe("openai");
    expect(c.apiKey).toBe("sk-openai-key-xyz");
    expect(c.authStyle).toBe("openai-api-key");
    expect(c.baseUrl).toBe("https://codex-proxy.example.com");
    expect(c.models).toEqual([]);
  });

  it("returns empty baseUrl if config string has no base_url", () => {
    // Rebuild DB with codex missing base_url
    rmSync(tmpDbPath, { force: true });
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (p: string) => DatabaseSyncLike;
    };
    const db = new DatabaseSync(tmpDbPath);
    db.exec(
      `CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT, website_url TEXT, notes TEXT, sort_index INTEGER, PRIMARY KEY(id,app_type))`,
    );
    const noBaseUrl = JSON.stringify({
      auth: { OPENAI_API_KEY: "key" },
      config: 'model = "gpt-4o"',
    });
    db.prepare("INSERT INTO providers VALUES (?,?,?,?,?,?,?)").run(
      "p1",
      "codex",
      "No BaseUrl",
      noBaseUrl,
      null,
      null,
      1,
    );
    db.close();

    const candidates = readCcSwitchVendors(tmpDbPath, "codex");
    expect(candidates[0].baseUrl).toBe("");
  });

  it("codex vendor with empty baseUrl passes VendorSchema (safe for savePersistedConfig)", () => {
    // Regression: VendorSchema.baseUrl was z.string().min(1) which would throw on safeParse
    // for any codex cc-switch provider whose TOML has no base_url. This verifies the fix:
    // baseUrl: "" is accepted by VendorSchema so savePersistedConfig won't crash.
    rmSync(tmpDbPath, { force: true });
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (p: string) => DatabaseSyncLike;
    };
    const db = new DatabaseSync(tmpDbPath);
    db.exec(
      `CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT, website_url TEXT, notes TEXT, sort_index INTEGER, PRIMARY KEY(id,app_type))`,
    );
    db.prepare("INSERT INTO providers VALUES (?,?,?,?,?,?,?)").run(
      "p-draft",
      "codex",
      "Draft Codex",
      JSON.stringify({ auth: { OPENAI_API_KEY: "key" }, config: 'model = "gpt-4o"' }),
      null,
      null,
      1,
    );
    db.close();

    const candidates = readCcSwitchVendors(tmpDbPath, "codex");
    const cand = candidates[0];
    expect(cand.baseUrl).toBe("");

    // Simulate what applyCcSwitchSync produces and what savePersistedConfig validates
    const draftVendor = {
      id: "vnd_draft-001",
      name: cand.name,
      baseUrl: cand.baseUrl,
      apiKey: cand.apiKey,
      apiFormat: cand.apiFormat,
      authStyle: cand.authStyle,
      models: cand.models,
      source: cand.source,
    };
    const result = VendorSchema.safeParse(draftVendor);
    expect(result.success).toBe(true);
  });
});

describe("readCcSwitchVendors — gemini excluded", () => {
  it("does not return gemini providers", () => {
    const claudeCandidates = readCcSwitchVendors(tmpDbPath, "claude");
    const codexCandidates = readCcSwitchVendors(tmpDbPath, "codex");
    // Only returns rows for the requested cli type
    expect(claudeCandidates.every((c) => c.cli === "claude")).toBe(true);
    expect(codexCandidates.every((c) => c.cli === "codex")).toBe(true);
  });
});

describe("diffAgainstExisting", () => {
  it('returns "new" for candidates not in existing', () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const items = diffAgainstExisting(candidates, []);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("new");
    expect(items[0].ccSwitchId).toBe("provider-claude-1");
    expect(items[0].name).toBe("My Claude Proxy");
    expect(items[0].baseUrl).toBe("https://claude-proxy.example.com");
  });

  it('returns "same" when existing vendor matches synced fields', () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const cand = candidates[0];
    // Build an existing vendor that matches all synced fields
    const existing: Vendor = {
      id: "vnd_existing-001",
      name: cand.name,
      baseUrl: cand.baseUrl,
      apiKey: cand.apiKey,
      apiFormat: cand.apiFormat,
      authStyle: cand.authStyle,
      configJson: cand.configJson,
      models: cand.models,
      source: cand.source,
      websiteUrl: cand.websiteUrl,
      notes: cand.notes,
      order: 99, // local override — does NOT affect sameness
      enabled: false, // local field
      exposedModelIds: ["model-a"], // local field
    };
    const items = diffAgainstExisting(candidates, [existing]);
    expect(items[0].status).toBe("same");
  });

  it('returns "update" when baseUrl differs', () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const cand = candidates[0];
    const existing: Vendor = {
      id: "vnd_existing-001",
      name: cand.name,
      baseUrl: "https://OLD.example.com", // different
      apiKey: cand.apiKey,
      apiFormat: cand.apiFormat,
      authStyle: cand.authStyle,
      configJson: cand.configJson,
      models: cand.models,
      source: cand.source,
    };
    const items = diffAgainstExisting(candidates, [existing]);
    expect(items[0].status).toBe("update");
  });
});

describe("applyCcSwitchSync", () => {
  it("adds new vendor for new candidate", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const result = applyCcSwitchSync(candidates, [], ["provider-claude-1"]);
    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.id).toBeDefined();
    expect(v.id.startsWith("vnd_")).toBe(true);
    expect(v.name).toBe("My Claude Proxy");
    expect(v.baseUrl).toBe("https://claude-proxy.example.com");
    expect(v.source).toEqual({ kind: "cc-switch", id: "provider-claude-1" });
    expect(v.enabled).toBe(true);
  });

  it("updates only synced fields on existing vendor, preserving local fields", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const cand = candidates[0];

    const existing: Vendor = {
      id: "vnd_existing-001",
      name: cand.name,
      baseUrl: "https://OLD.example.com",
      apiKey: cand.apiKey,
      apiFormat: cand.apiFormat,
      authStyle: cand.authStyle,
      configJson: cand.configJson,
      models: cand.models,
      source: cand.source,
      order: 5,
      enabled: false,
      exposedModelIds: ["pinned-model"],
      defaultModelId: "pinned-model",
    };

    const result = applyCcSwitchSync(candidates, [existing], ["provider-claude-1"]);
    expect(result).toHaveLength(1);
    const v = result[0];
    // Synced fields updated:
    expect(v.baseUrl).toBe("https://claude-proxy.example.com");
    // Local fields preserved:
    expect(v.id).toBe("vnd_existing-001");
    expect(v.order).toBe(5);
    expect(v.enabled).toBe(false);
    expect(v.exposedModelIds).toEqual(["pinned-model"]);
    expect(v.defaultModelId).toBe("pinned-model");
  });

  it("preserves non-cc-switch vendors", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const manualVendor: Vendor = {
      id: "vnd_manual-001",
      name: "Manual Vendor",
      baseUrl: "https://manual.example.com",
      apiFormat: "anthropic",
      authStyle: "anthropic-api-key",
    };
    const result = applyCcSwitchSync(candidates, [manualVendor], ["provider-claude-1"]);
    // Both the new cc-switch vendor and the manual vendor should be present
    expect(result).toHaveLength(2);
    expect(result.find((v) => v.id === "vnd_manual-001")).toBeDefined();
  });

  it("does not add when ccSwitchId not in selectedIds", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const result = applyCcSwitchSync(candidates, [], []); // empty selectedIds
    expect(result).toHaveLength(0);
  });

  it("is idempotent — applying twice produces same result (no duplicates)", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const first = applyCcSwitchSync(candidates, [], ["provider-claude-1"]);
    const second = applyCcSwitchSync(candidates, first, ["provider-claude-1"]);
    expect(second).toHaveLength(1); // not 2
    expect(second[0].id).toBe(first[0].id); // same id preserved
  });

  it("preserves local fields on idempotent re-apply", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const first = applyCcSwitchSync(candidates, [], ["provider-claude-1"]);
    // Simulate user editing local fields after first apply
    const afterUserEdit: Vendor[] = [
      {
        ...first[0],
        exposedModelIds: ["user-chosen-model"],
        defaultModelId: "user-chosen-model",
        enabled: false,
        order: 10,
      },
    ];
    const second = applyCcSwitchSync(candidates, afterUserEdit, ["provider-claude-1"]);
    expect(second[0].exposedModelIds).toEqual(["user-chosen-model"]);
    expect(second[0].defaultModelId).toBe("user-chosen-model");
    expect(second[0].enabled).toBe(false);
    expect(second[0].order).toBe(10);
  });

  it("modelCount in diff matches model count from candidates", () => {
    const candidates = readCcSwitchVendors(tmpDbPath, "claude");
    const items = diffAgainstExisting(candidates, []);
    const modelCount = candidates[0].models?.length ?? 0;
    expect(items[0].modelCount).toBe(modelCount);
  });
});

describe("readCcSwitchVendors — error handling", () => {
  it("throws on non-existent db path", () => {
    expect(() => readCcSwitchVendors("/nonexistent/path.db", "claude")).toThrow();
  });
});
