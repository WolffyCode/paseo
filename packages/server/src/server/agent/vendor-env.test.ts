import { describe, expect, it } from "vitest";
import { compileVendorEnv } from "./vendor-env.js";
import type { Vendor } from "./provider-launch-config.js";

function makeVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "test-vendor",
    name: "Test Vendor",
    baseUrl: "https://api.z.ai/api/anthropic",
    apiKey: "sk-test-key",
    apiFormat: "anthropic",
    authStyle: "anthropic-auth-token",
    ...overrides,
  };
}

describe("compileVendorEnv", () => {
  describe("claude + anthropic-auth-token", () => {
    it("sets ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN", () => {
      const vendor = makeVendor({ authStyle: "anthropic-auth-token" });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_BASE_URL).toBe(vendor.baseUrl);
      expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe(vendor.apiKey);
      expect(result.env.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it("sets ANTHROPIC_MODEL when model is provided", () => {
      const vendor = makeVendor({ authStyle: "anthropic-auth-token" });
      const result = compileVendorEnv({ cli: "claude", vendor, model: "glm-5-turbo" });
      expect(result.env.ANTHROPIC_MODEL).toBe("glm-5-turbo");
    });

    it("does not set ANTHROPIC_MODEL when model is not provided", () => {
      const vendor = makeVendor({ authStyle: "anthropic-auth-token" });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_MODEL).toBeUndefined();
    });

    it("includes WebSearch in disallowedTools for third-party baseUrl", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        baseUrl: "https://api.z.ai/api/anthropic",
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.disallowedTools).toContain("WebSearch");
    });

    it("does not include WebSearch in disallowedTools for official Anthropic baseUrl", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        baseUrl: "https://api.anthropic.com/v1",
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.disallowedTools).toBeUndefined();
    });

    it("merges configJson.env into env (lower precedence than explicit keys)", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        configJson: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "should-be-overridden",
            API_TIMEOUT_MS: "3000000",
          },
        },
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe(vendor.apiKey);
      expect(result.env.API_TIMEOUT_MS).toBe("3000000");
    });
  });

  describe("claude + anthropic-api-key", () => {
    it("sets ANTHROPIC_API_KEY (not ANTHROPIC_AUTH_TOKEN)", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-api-key",
        baseUrl: "https://api.anthropic.com/v1",
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_API_KEY).toBe(vendor.apiKey);
      expect(result.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    });

    it("sets ANTHROPIC_BASE_URL", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-api-key",
        baseUrl: "https://api.anthropic.com/v1",
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_BASE_URL).toBe(vendor.baseUrl);
    });
  });

  describe("codex + openai-api-key", () => {
    it("sets OPENAI_BASE_URL and OPENAI_API_KEY", () => {
      const vendor = makeVendor({
        authStyle: "openai-api-key",
        apiFormat: "openai",
        baseUrl: "https://custom-relay.example.com",
        apiKey: "sk-openai-key",
      });
      const result = compileVendorEnv({ cli: "codex", vendor });
      expect(result.env.OPENAI_BASE_URL).toBe(vendor.baseUrl);
      expect(result.env.OPENAI_API_KEY).toBe(vendor.apiKey);
    });

    it("does not set model env var (handled by Task 1.5)", () => {
      const vendor = makeVendor({
        authStyle: "openai-api-key",
        apiFormat: "openai",
        baseUrl: "https://custom-relay.example.com",
        apiKey: "sk-openai-key",
      });
      const result = compileVendorEnv({ cli: "codex", vendor, model: "gpt-4o" });
      expect(result.env.OPENAI_MODEL).toBeUndefined();
    });

    it("does not set disallowedTools for codex", () => {
      const vendor = makeVendor({
        authStyle: "openai-api-key",
        apiFormat: "openai",
        baseUrl: "https://custom-relay.example.com",
        apiKey: "sk-openai-key",
      });
      const result = compileVendorEnv({ cli: "codex", vendor });
      expect(result.disallowedTools).toBeUndefined();
    });
  });

  describe("merge order precedence", () => {
    it("commonConfig.env < configJson.env < explicit keys", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        baseUrl: "https://api.z.ai/api/anthropic",
        apiKey: "explicit-key",
        configJson: {
          env: {
            ANTHROPIC_AUTH_TOKEN: "configJson-key",
            EXTRA_FROM_CONFIG: "from-configJson",
          },
        },
      });
      const commonConfig: Record<string, unknown> = {
        env: {
          ANTHROPIC_AUTH_TOKEN: "common-key",
          EXTRA_FROM_COMMON: "from-common",
        },
      };
      const result = compileVendorEnv({ cli: "claude", vendor, commonConfig });
      // Explicit key wins over configJson and commonConfig
      expect(result.env.ANTHROPIC_AUTH_TOKEN).toBe("explicit-key");
      // configJson key overrides commonConfig
      expect(result.env.EXTRA_FROM_CONFIG).toBe("from-configJson");
      // commonConfig key is present
      expect(result.env.EXTRA_FROM_COMMON).toBe("from-common");
    });

    it("coerces non-string values to strings", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        configJson: {
          env: {
            NUMERIC_VAR: 42,
            BOOL_VAR: true,
          },
        },
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.NUMERIC_VAR).toBe("42");
      expect(result.env.BOOL_VAR).toBe("true");
    });
  });

  describe("no apiKey", () => {
    it("does not set key env var when apiKey is absent", () => {
      const vendor = makeVendor({
        authStyle: "anthropic-auth-token",
        apiKey: undefined,
      });
      const result = compileVendorEnv({ cli: "claude", vendor });
      expect(result.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
      expect(result.env.ANTHROPIC_API_KEY).toBeUndefined();
    });
  });
});
