/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Vendor } from "@getpaseo/protocol/provider-config";

import { useVendorDraft, isQuickToggleOn } from "./use-vendor-draft";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useVendorDraft — new vendor (no initial)", () => {
  it("initializes with empty/default values", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));
    const { draft, isValid, errors } = result.current;

    expect(draft.name).toBe("");
    expect(draft.baseUrl).toBe("");
    expect(draft.apiFormat).toBe("anthropic");
    expect(draft.authStyle).toBe("anthropic-auth-token");
    expect(draft.configJson).toEqual({});
    // Empty name → not valid + error
    expect(isValid).toBe(false);
    expect(errors.name).toBeDefined();
  });

  it("setField('baseUrl') writes into configJson.env.ANTHROPIC_BASE_URL and updates configJsonText (field→JSON sync)", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("baseUrl", "https://r/v1");
    });

    expect(result.current.draft.baseUrl).toBe("https://r/v1");
    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.ANTHROPIC_BASE_URL).toBe("https://r/v1");

    // configJsonText should reflect the updated configJson
    const parsed = JSON.parse(result.current.configJsonText) as { env: Record<string, string> };
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe("https://r/v1");
  });

  it("setField('apiKey') writes into the correct auth env var (anthropic-auth-token → ANTHROPIC_AUTH_TOKEN)", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("apiKey", "sk-test-key");
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.ANTHROPIC_AUTH_TOKEN).toBe("sk-test-key");
    expect(env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("setField('apiKey') writes into ANTHROPIC_API_KEY when authStyle is anthropic-api-key", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("authStyle", "anthropic-api-key");
      result.current.setField("apiKey", "sk-test-key");
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.ANTHROPIC_API_KEY).toBe("sk-test-key");
    expect(env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it("setField('apiKey') writes into OPENAI_API_KEY when authStyle is openai-api-key", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("authStyle", "openai-api-key");
      result.current.setField("apiKey", "sk-openai-key");
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.OPENAI_API_KEY).toBe("sk-openai-key");
  });

  it("changing authStyle migrates the apiKey to the new env var and clears the old one", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("apiKey", "my-key");
    });

    // Key should be in ANTHROPIC_AUTH_TOKEN now
    const envBefore = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(envBefore?.ANTHROPIC_AUTH_TOKEN).toBe("my-key");

    // Switch authStyle → anthropic-api-key
    act(() => {
      result.current.setField("authStyle", "anthropic-api-key");
    });

    const envAfter = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(envAfter?.ANTHROPIC_API_KEY).toBe("my-key");
    expect(envAfter?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it("setField('fallbackModel') writes into configJson.env.ANTHROPIC_MODEL", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("fallbackModel", "claude-opus-4-5");
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.ANTHROPIC_MODEL).toBe("claude-opus-4-5");
  });

  it("setConfigJsonText with valid JSON back-fills baseUrl and apiKey (JSON→field back-fill)", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.setConfigJsonText(
        '{"env":{"ANTHROPIC_BASE_URL":"https://x/v1","ANTHROPIC_AUTH_TOKEN":"k"}}',
      );
    });

    expect(res!.ok).toBe(true);
    expect(result.current.draft.baseUrl).toBe("https://x/v1");
    expect(result.current.draft.apiKey).toBe("k");
  });

  it("setConfigJsonText with invalid JSON returns { ok: false, error: ... } and keeps isValid false", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    // Give a valid name so the only invalidity is the JSON
    act(() => {
      result.current.setField("name", "Test");
      result.current.setConfigJsonText("{ invalid json }");
    });

    expect(result.current.isValid).toBe(false);
  });

  it("setConfigJsonText with invalid JSON returns { ok: false, error } from the call itself", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    let res: { ok: boolean; error?: string } = { ok: true };
    act(() => {
      res = result.current.setConfigJsonText("not json at all!!!");
    });

    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(typeof res.error).toBe("string");
  });

  it("empty name → errors.name set, isValid false", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    // Trigger validation by trying to call toVendor after setting name
    act(() => {
      result.current.setField("name", "");
    });

    expect(result.current.errors.name).toBeDefined();
    expect(result.current.isValid).toBe(false);
  });

  it("valid name clears name error and allows isValid to be true", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("name", "My Vendor");
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.isValid).toBe(true);
  });

  it("toVendor() generates an id starting with 'vnd_' for new vendor", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("name", "Test Vendor");
    });

    const vendor = result.current.toVendor();
    expect(vendor.id).toMatch(/^vnd_/);
  });

  it("toVendor() preserves source when included in draft", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("name", "From CC Switch");
      result.current.setField("source", { kind: "cc-switch", id: "cc-abc" });
    });

    const vendor = result.current.toVendor();
    expect(vendor.source).toEqual({ kind: "cc-switch", id: "cc-abc" });
  });
});

describe("useVendorDraft — from existing vendor (with initial)", () => {
  const existingVendor: Vendor = {
    id: "vendor-existing-1",
    name: "Existing Vendor",
    baseUrl: "https://existing.api.com/v1",
    apiKey: "existing-key",
    apiFormat: "anthropic",
    authStyle: "anthropic-api-key",
    fallbackModel: "claude-3-5-sonnet",
    configJson: {
      env: {
        ANTHROPIC_BASE_URL: "https://existing.api.com/v1",
        ANTHROPIC_API_KEY: "existing-key",
        ANTHROPIC_MODEL: "claude-3-5-sonnet",
      },
    },
    source: { kind: "cc-switch", id: "cc-switch-1" },
    models: [{ id: "m1", label: "Model 1" }],
    exposedModelIds: ["m1"],
  };

  it("populates draft fields from the existing vendor", () => {
    const { result } = renderHook(() => useVendorDraft(existingVendor, "claude"));
    const { draft } = result.current;

    expect(draft.id).toBe("vendor-existing-1");
    expect(draft.name).toBe("Existing Vendor");
    expect(draft.baseUrl).toBe("https://existing.api.com/v1");
    expect(draft.apiKey).toBe("existing-key");
    expect(draft.fallbackModel).toBe("claude-3-5-sonnet");
    expect(draft.authStyle).toBe("anthropic-api-key");
    expect(draft.apiFormat).toBe("anthropic");
    expect(draft.source).toEqual({ kind: "cc-switch", id: "cc-switch-1" });
  });

  it("isValid is true when existing vendor has a name", () => {
    const { result } = renderHook(() => useVendorDraft(existingVendor, "claude"));
    expect(result.current.isValid).toBe(true);
  });

  it("toVendor() preserves the existing id (no new id generated)", () => {
    const { result } = renderHook(() => useVendorDraft(existingVendor, "claude"));
    const vendor = result.current.toVendor();
    expect(vendor.id).toBe("vendor-existing-1");
  });

  it("toVendor() preserves models and exposedModelIds", () => {
    const { result } = renderHook(() => useVendorDraft(existingVendor, "claude"));
    const vendor = result.current.toVendor();
    expect(vendor.models).toEqual([{ id: "m1", label: "Model 1" }]);
    expect(vendor.exposedModelIds).toEqual(["m1"]);
  });
});

describe("useVendorDraft — quick toggles", () => {
  it("toggleQuick('hideAiSignature', true) sets configJson.env.HIDE_USAGE_ATTRIBUTION = '1'", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("hideAiSignature", true);
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.HIDE_USAGE_ATTRIBUTION).toBe("1");
  });

  it("toggleQuick('hideAiSignature', false) removes HIDE_USAGE_ATTRIBUTION", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("hideAiSignature", true);
    });
    act(() => {
      result.current.toggleQuick("hideAiSignature", false);
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.HIDE_USAGE_ATTRIBUTION).toBeUndefined();
  });

  it("toggleQuick('teammatesMode', true) sets configJson.teammates = true", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("teammatesMode", true);
    });

    expect(result.current.draft.configJson.teammates).toBe(true);
  });

  it("toggleQuick('teammatesMode', false) removes configJson.teammates", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("teammatesMode", true);
    });
    act(() => {
      result.current.toggleQuick("teammatesMode", false);
    });

    expect(result.current.draft.configJson.teammates).toBeUndefined();
  });

  it("toggleQuick('enableToolSearch', true) sets configJson.env.CLAUDE_ENABLE_TOOL_SEARCH = '1'", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("enableToolSearch", true);
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.CLAUDE_ENABLE_TOOL_SEARCH).toBe("1");
  });

  it("toggleQuick('maxThinking', true) sets configJson.env.CLAUDE_MAX_THINKING = '1'", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("maxThinking", true);
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.CLAUDE_MAX_THINKING).toBe("1");
  });

  it("toggleQuick('disableAutoUpgrade', true) sets configJson.env.DISABLE_AUTOUPDATER = '1'", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.toggleQuick("disableAutoUpgrade", true);
    });

    const env = (result.current.draft.configJson as { env?: Record<string, string> }).env;
    expect(env?.DISABLE_AUTOUPDATER).toBe("1");
  });
});

describe("useVendorDraft — re-initialization when vendor identity changes (Fix 1)", () => {
  const vendorA: Vendor = {
    id: "vnd-a",
    name: "Vendor A",
    baseUrl: "https://a.example.com/v1",
    apiKey: "key-a",
    apiFormat: "anthropic",
    authStyle: "anthropic-api-key",
    configJson: {
      env: {
        ANTHROPIC_BASE_URL: "https://a.example.com/v1",
        ANTHROPIC_API_KEY: "key-a",
      },
    },
  };

  const vendorB: Vendor = {
    id: "vnd-b",
    name: "Vendor B",
    baseUrl: "https://b.example.com/v1",
    apiKey: "key-b",
    apiFormat: "openai",
    authStyle: "openai-api-key",
    configJson: {
      env: {
        ANTHROPIC_BASE_URL: "https://b.example.com/v1",
        OPENAI_API_KEY: "key-b",
      },
    },
  };

  it("re-derives draft when switching from vendorA to vendorB", () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: Vendor | undefined }) => useVendorDraft(initial, "claude"),
      { initialProps: { initial: vendorA as Vendor | undefined } },
    );

    // Confirm vendor A loaded
    expect(result.current.draft.name).toBe("Vendor A");
    expect(result.current.draft.baseUrl).toBe("https://a.example.com/v1");

    // Switch to vendor B
    rerender({ initial: vendorB });

    expect(result.current.draft.name).toBe("Vendor B");
    expect(result.current.draft.baseUrl).toBe("https://b.example.com/v1");
    expect(result.current.draft.apiFormat).toBe("openai");

    // configJson should reflect vendor B, not vendor A
    const parsed = JSON.parse(result.current.configJsonText) as { env: Record<string, string> };
    expect(parsed.env.ANTHROPIC_BASE_URL).toBe("https://b.example.com/v1");
  });

  it("re-derives draft when switching from a vendor to new-vendor (undefined)", () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: Vendor | undefined }) => useVendorDraft(initial, "claude"),
      { initialProps: { initial: vendorA as Vendor | undefined } },
    );

    expect(result.current.draft.name).toBe("Vendor A");

    rerender({ initial: undefined });

    expect(result.current.draft.name).toBe("");
    expect(result.current.draft.baseUrl).toBe("");
    expect(result.current.draft.configJson).toEqual({});
  });

  it("re-derives draft when switching from new-vendor (undefined) to an existing vendor", () => {
    const { result, rerender } = renderHook(
      ({ initial }: { initial: Vendor | undefined }) => useVendorDraft(initial, "claude"),
      { initialProps: { initial: undefined as Vendor | undefined } },
    );

    expect(result.current.draft.name).toBe("");

    rerender({ initial: vendorB });

    expect(result.current.draft.name).toBe("Vendor B");
    expect(result.current.draft.baseUrl).toBe("https://b.example.com/v1");
  });
});

describe("useVendorDraft — model setters", () => {
  it("toggleExposed(id, true) adds id to exposedModelIds", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setModels([{ id: "m1" }, { id: "m2" }]);
      result.current.toggleExposed("m1", true);
    });

    expect(result.current.draft.exposedModelIds).toContain("m1");
  });

  it("toggleExposed(id, false) removes id from exposedModelIds", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setModels([{ id: "m1" }]);
      result.current.toggleExposed("m1", true);
    });
    act(() => {
      result.current.toggleExposed("m1", false);
    });

    expect(result.current.draft.exposedModelIds).not.toContain("m1");
  });

  it("toggleExposed(id, true) is idempotent — no duplicates in exposedModelIds", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setModels([{ id: "m1" }]);
      result.current.toggleExposed("m1", true);
    });
    act(() => {
      result.current.toggleExposed("m1", true);
    });

    const ids = result.current.draft.exposedModelIds ?? [];
    expect(ids.filter((id) => id === "m1")).toHaveLength(1);
  });

  it("addManualModel pushes {id, source:'manual'} to models and auto-exposes it", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.addManualModel("my-custom-model");
    });

    const models = result.current.draft.models ?? [];
    expect(models.some((m) => m.id === "my-custom-model" && m.source === "manual")).toBe(true);
    expect(result.current.draft.exposedModelIds).toContain("my-custom-model");
  });

  it("addManualModel is idempotent — calling twice does not duplicate the model", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.addManualModel("dup-model");
    });
    act(() => {
      result.current.addManualModel("dup-model");
    });

    const models = result.current.draft.models ?? [];
    expect(models.filter((m) => m.id === "dup-model")).toHaveLength(1);
  });

  it("setModels merges fetched models with existing manual models (dedupe by id, keeps manual)", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    // Add a manual model first
    act(() => {
      result.current.addManualModel("my-manual");
    });

    // Now receive fetched models — one overlaps with the manual model id
    act(() => {
      result.current.setModels([
        { id: "fetched-a", source: "fetched" as const },
        { id: "my-manual", source: "fetched" as const },
      ]);
    });

    const models = result.current.draft.models ?? [];
    // Should have my-manual (manual) + fetched-a (fetched) — no duplicate my-manual
    expect(models.length).toBe(2);
    const manual = models.find((m) => m.id === "my-manual");
    expect(manual?.source).toBe("manual");
  });

  it("setModels does not lose existing manual items that are not in the fetch result", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.addManualModel("keep-me");
    });

    act(() => {
      result.current.setModels([{ id: "remote-model", source: "fetched" as const }]);
    });

    const models = result.current.draft.models ?? [];
    expect(models.some((m) => m.id === "keep-me")).toBe(true);
    expect(models.some((m) => m.id === "remote-model")).toBe(true);
  });

  it("setDefaultModel sets defaultModelId when model is exposed", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.addManualModel("m1");
      result.current.toggleExposed("m1", true);
    });
    act(() => {
      result.current.setDefaultModel("m1");
    });

    expect(result.current.draft.defaultModelId).toBe("m1");
  });

  it("setDefaultModel is a no-op when model is NOT in exposedModelIds", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.addManualModel("m1");
      result.current.toggleExposed("m1", false);
    });
    act(() => {
      result.current.setDefaultModel("m1");
    });

    expect(result.current.draft.defaultModelId).toBeUndefined();
  });

  it("toVendor() preserves models setters in saved vendor shape", () => {
    const { result } = renderHook(() => useVendorDraft(undefined, "claude"));

    act(() => {
      result.current.setField("name", "Test");
      result.current.addManualModel("manual-m1");
      result.current.setDefaultModel("manual-m1");
    });

    const vendor = result.current.toVendor();
    expect(vendor.models?.some((m) => m.id === "manual-m1")).toBe(true);
    expect(vendor.exposedModelIds).toContain("manual-m1");
    expect(vendor.defaultModelId).toBe("manual-m1");
  });
});

describe("isQuickToggleOn helper", () => {
  it("returns true when the right env key is '1'", () => {
    expect(isQuickToggleOn({ env: { HIDE_USAGE_ATTRIBUTION: "1" } }, "hideAiSignature")).toBe(true);
  });

  it("returns false when the env key is missing", () => {
    expect(isQuickToggleOn({}, "hideAiSignature")).toBe(false);
  });

  it("returns true for teammatesMode when configJson.teammates is true", () => {
    expect(isQuickToggleOn({ teammates: true }, "teammatesMode")).toBe(true);
  });

  it("returns false for teammatesMode when configJson.teammates is undefined", () => {
    expect(isQuickToggleOn({}, "teammatesMode")).toBe(false);
  });
});
