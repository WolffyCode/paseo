/**
 * Tests for getModelCapabilities pure function.
 *
 * Truth table:
 * - direct Anthropic claude (vendor=null, provider="claude") → webSearch:true, thinking:true, attachments:true
 * - third-party vendor + claude-compatible → webSearch:false, thinking:true, attachments:true
 * - third-party vendor + openai GLM-like model → webSearch:false, thinking:false, attachments:true
 * - codex/openai family → webSearch:false, thinking:false (o-series:true), attachments:true
 * - unknown model → conservative defaults: webSearch:false, thinking:false, attachments:true
 */
import { describe, expect, it } from "vitest";
import { getModelCapabilities } from "./model-capabilities";
import type { Vendor } from "@getpaseo/protocol/provider-config";

// Minimal Vendor stub for testing — only fields getModelCapabilities reads.
function makeVendor(overrides?: Partial<Vendor>): Vendor {
  return {
    id: "test-vendor",
    name: "Test Vendor",
    baseUrl: "https://example.com",
    apiFormat: "anthropic",
    authStyle: "anthropic-api-key",
    ...overrides,
  };
}

describe("getModelCapabilities", () => {
  describe("direct Anthropic claude (vendor=null)", () => {
    it("claude-opus-4-8 → all capabilities true", () => {
      const caps = getModelCapabilities({
        provider: "claude",
        vendor: null,
        modelId: "claude-opus-4-8",
      });
      expect(caps).toEqual({ webSearch: true, thinking: true, attachments: true });
    });

    it("claude-sonnet-4-5 → all capabilities true", () => {
      const caps = getModelCapabilities({
        provider: "claude",
        vendor: null,
        modelId: "claude-sonnet-4-5",
      });
      expect(caps).toEqual({ webSearch: true, thinking: true, attachments: true });
    });

    it("claude-haiku-3-5 → all capabilities true", () => {
      const caps = getModelCapabilities({
        provider: "claude",
        vendor: null,
        modelId: "claude-haiku-3-5",
      });
      expect(caps).toEqual({ webSearch: true, thinking: true, attachments: true });
    });

    it("null modelId (direct claude, no model chosen) → webSearch:true (direct Anthropic endpoint)", () => {
      const caps = getModelCapabilities({
        provider: "claude",
        vendor: null,
        modelId: null,
      });
      expect(caps.webSearch).toBe(true);
      expect(caps.attachments).toBe(true);
    });
  });

  describe("third-party vendor + anthropic-format (claude-compatible)", () => {
    it("vendor + glm model → webSearch:false", () => {
      const vendor = makeVendor({ apiFormat: "anthropic" });
      const caps = getModelCapabilities({
        provider: "claude",
        vendor,
        modelId: "glm-4-air",
      });
      expect(caps.webSearch).toBe(false);
    });

    it("vendor + kimi/moonshot model → webSearch:false, thinking:true, attachments:true", () => {
      const vendor = makeVendor({ apiFormat: "anthropic" });
      const caps = getModelCapabilities({
        provider: "claude",
        vendor,
        modelId: "moonshot-v1-8k",
      });
      expect(caps).toEqual({ webSearch: false, thinking: true, attachments: true });
    });

    it("vendor + minimax model → webSearch:false", () => {
      const vendor = makeVendor({ apiFormat: "anthropic" });
      const caps = getModelCapabilities({
        provider: "claude",
        vendor,
        modelId: "minimax-text-01",
      });
      expect(caps.webSearch).toBe(false);
    });

    it("vendor + claude model (third-party relay) → webSearch:false, thinking:true, attachments:true", () => {
      const vendor = makeVendor({ apiFormat: "anthropic" });
      const caps = getModelCapabilities({
        provider: "claude",
        vendor,
        modelId: "claude-opus-4-8",
      });
      expect(caps).toEqual({ webSearch: false, thinking: true, attachments: true });
    });
  });

  describe("codex/openai provider", () => {
    it("gpt-4o (no vendor) → webSearch:false, thinking:false, attachments:true", () => {
      const caps = getModelCapabilities({
        provider: "codex",
        vendor: null,
        modelId: "gpt-4o",
      });
      expect(caps).toEqual({ webSearch: false, thinking: false, attachments: true });
    });

    it("o1/o3 series → thinking:true, webSearch:false, attachments:true", () => {
      const caps = getModelCapabilities({
        provider: "codex",
        vendor: null,
        modelId: "o1",
      });
      expect(caps).toEqual({ webSearch: false, thinking: true, attachments: true });
    });

    it("o3-mini → thinking:true", () => {
      const caps = getModelCapabilities({
        provider: "codex",
        vendor: null,
        modelId: "o3-mini",
      });
      expect(caps.thinking).toBe(true);
    });
  });

  describe("null provider (fresh draft, no provider chosen)", () => {
    it("null provider + null vendor + null modelId → conservative defaults (no thinking chip)", () => {
      const caps = getModelCapabilities({
        provider: null,
        vendor: null,
        modelId: null,
      });
      expect(caps).toEqual({ webSearch: false, thinking: false, attachments: true });
    });
  });

  describe("unknown/conservative defaults", () => {
    it("unknown provider + null modelId → conservative: webSearch:false, thinking:false, attachments:true", () => {
      const caps = getModelCapabilities({
        provider: "unknown-provider",
        vendor: null,
        modelId: null,
      });
      expect(caps).toEqual({ webSearch: false, thinking: false, attachments: true });
    });

    it("unknown provider + some model → conservative defaults", () => {
      const caps = getModelCapabilities({
        provider: "some-other-provider",
        vendor: null,
        modelId: "some-exotic-model",
      });
      expect(caps).toEqual({ webSearch: false, thinking: false, attachments: true });
    });
  });
});
