import type { Vendor } from "./provider-launch-config.js";

export interface CompileVendorEnvInput {
  cli: "claude" | "codex";
  vendor: Vendor;
  /**
   * Per-CLI sub-record from VendorCommonConfig (e.g. commonConfig.claude or
   * commonConfig.codex). Lowest-precedence source in the merge order.
   */
  commonConfig?: Record<string, unknown>;
  model?: string;
}

export interface CompileVendorEnvResult {
  env: Record<string, string>;
  disallowedTools?: string[];
}

const ANTHROPIC_HOST = "api.anthropic.com";

/**
 * Returns true when the baseUrl points to a third-party endpoint (i.e. not
 * the official Anthropic API host). Third-party endpoints do not support
 * Anthropic server-side tools like WebSearch.
 */
function isThirdPartyEndpoint(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname !== ANTHROPIC_HOST;
  } catch {
    // Malformed URL — treat as third-party to be safe.
    return true;
  }
}

/**
 * Coerce an unknown overlay value to a string. Skips null/undefined.
 */
function coerceEnvOverlay(
  overlay: Record<string, unknown> | undefined,
  acc: Record<string, string>,
): void {
  if (!overlay) {
    return;
  }
  for (const [k, v] of Object.entries(overlay)) {
    if (v !== null && v !== undefined) {
      acc[k] = String(v);
    }
  }
}

/**
 * Compile a vendor (url + key + config) into the environment variables the
 * CLI child process needs, plus an optional disallowedTools list.
 *
 * Merge order (later wins):
 *   commonConfig.env < vendor.configJson.env < explicit (baseUrl/key/model)
 *
 * NOTE: model env injection is claude-only. Codex model routing is handled by
 * the model_providers TOML injected in Task 1.5.
 */
export function compileVendorEnv(input: CompileVendorEnvInput): CompileVendorEnvResult {
  const { cli, vendor, commonConfig, model } = input;

  const env: Record<string, string> = {};

  // Layer 1: commonConfig.env (lowest precedence)
  const commonEnv =
    commonConfig?.env !== null &&
    commonConfig?.env !== undefined &&
    typeof commonConfig.env === "object"
      ? (commonConfig.env as Record<string, unknown>)
      : undefined;
  coerceEnvOverlay(commonEnv, env);

  // Layer 2: vendor.configJson.env
  const configJsonEnv =
    vendor.configJson?.env !== null &&
    vendor.configJson?.env !== undefined &&
    typeof vendor.configJson.env === "object"
      ? (vendor.configJson.env as Record<string, unknown>)
      : undefined;
  coerceEnvOverlay(configJsonEnv, env);

  // Layer 3: explicit keys (highest precedence)
  if (cli === "claude") {
    env.ANTHROPIC_BASE_URL = vendor.baseUrl;

    if (vendor.apiKey !== undefined) {
      if (vendor.authStyle === "anthropic-auth-token") {
        env.ANTHROPIC_AUTH_TOKEN = vendor.apiKey;
      } else if (vendor.authStyle === "anthropic-api-key") {
        env.ANTHROPIC_API_KEY = vendor.apiKey;
      }
    }

    if (model !== undefined) {
      env.ANTHROPIC_MODEL = model;
    }

    // WebSearch is an Anthropic-only server-side tool. Third-party endpoints
    // do not support it; disallow it automatically to avoid runtime errors.
    if (isThirdPartyEndpoint(vendor.baseUrl)) {
      return { env, disallowedTools: ["WebSearch"] };
    }

    return { env };
  }

  // cli === "codex"
  env.OPENAI_BASE_URL = vendor.baseUrl;

  if (vendor.apiKey !== undefined && vendor.authStyle === "openai-api-key") {
    env.OPENAI_API_KEY = vendor.apiKey;
  }

  // Codex model routing via model_providers TOML is handled in Task 1.5;
  // we intentionally do NOT set OPENAI_MODEL here.

  return { env };
}
