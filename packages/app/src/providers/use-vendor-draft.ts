import { useEffect, useRef, useState } from "react";
import type { Vendor, VendorModel } from "@getpaseo/protocol/provider-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuickToggleKey =
  | "hideAiSignature"
  | "teammatesMode"
  | "enableToolSearch"
  | "maxThinking"
  | "disableAutoUpgrade";

export interface VendorDraft {
  id?: string;
  name: string;
  notes?: string;
  websiteUrl?: string;
  apiKey?: string;
  baseUrl: string;
  apiFormat: "anthropic" | "openai";
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key";
  fallbackModel?: string;
  configJson: Record<string, unknown>;
  models?: VendorModel[];
  exposedModelIds?: string[];
  defaultModelId?: string;
  source?: { kind: "cc-switch"; id: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the env var key name for the given auth style. */
function authEnvKey(
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key",
): string {
  if (authStyle === "anthropic-api-key") return "ANTHROPIC_API_KEY";
  if (authStyle === "openai-api-key") return "OPENAI_API_KEY";
  return "ANTHROPIC_AUTH_TOKEN";
}

/** Get or create env sub-object from configJson (immutably). */
function getEnv(configJson: Record<string, unknown>): Record<string, string> {
  const env = configJson.env;
  if (env && typeof env === "object" && !Array.isArray(env)) {
    return env as Record<string, string>;
  }
  return {};
}

/** Produce a new configJson with updated env key. */
function setEnvKey(
  configJson: Record<string, unknown>,
  key: string,
  value: string | undefined,
): Record<string, unknown> {
  const env = { ...getEnv(configJson) };
  if (value === undefined || value === "") {
    delete env[key];
  } else {
    env[key] = value;
  }
  // If env is now empty, remove it entirely
  if (Object.keys(env).length === 0) {
    const next = { ...configJson };
    delete next.env;
    return next;
  }
  return { ...configJson, env };
}

/** Back-fill convenience fields from configJson.env after a JSON edit. */
function backFillFromConfigJson(
  configJson: Record<string, unknown>,
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key",
): Pick<VendorDraft, "baseUrl" | "apiKey" | "fallbackModel"> {
  const env = getEnv(configJson);
  return {
    baseUrl: (env.ANTHROPIC_BASE_URL as string | undefined) ?? "",
    apiKey: (env[authEnvKey(authStyle)] as string | undefined) ?? undefined,
    fallbackModel: (env.ANTHROPIC_MODEL as string | undefined) ?? undefined,
  };
}

/** Read the current state of a quick toggle from configJson. */
export function isQuickToggleOn(configJson: Record<string, unknown>, key: QuickToggleKey): boolean {
  const env = getEnv(configJson);
  switch (key) {
    case "hideAiSignature":
      return env.HIDE_USAGE_ATTRIBUTION === "1";
    case "teammatesMode":
      return configJson.teammates === true;
    case "enableToolSearch":
      return env.CLAUDE_ENABLE_TOOL_SEARCH === "1";
    case "maxThinking":
      return env.CLAUDE_MAX_THINKING === "1";
    case "disableAutoUpgrade":
      return env.DISABLE_AUTOUPDATER === "1";
  }
}

/** Apply a quick toggle to configJson and return the new configJson. */
function applyQuickToggle(
  configJson: Record<string, unknown>,
  key: QuickToggleKey,
  on: boolean,
): Record<string, unknown> {
  switch (key) {
    case "hideAiSignature":
      return setEnvKey(configJson, "HIDE_USAGE_ATTRIBUTION", on ? "1" : undefined);
    case "teammatesMode": {
      const next = { ...configJson };
      if (on) {
        next.teammates = true;
      } else {
        delete next.teammates;
      }
      return next;
    }
    case "enableToolSearch":
      return setEnvKey(configJson, "CLAUDE_ENABLE_TOOL_SEARCH", on ? "1" : undefined);
    case "maxThinking":
      return setEnvKey(configJson, "CLAUDE_MAX_THINKING", on ? "1" : undefined);
    case "disableAutoUpgrade":
      return setEnvKey(configJson, "DISABLE_AUTOUPDATER", on ? "1" : undefined);
  }
}

// ---------------------------------------------------------------------------
// Default draft factory
// ---------------------------------------------------------------------------

function makeDefaultDraft(): VendorDraft {
  return {
    name: "",
    baseUrl: "",
    apiFormat: "anthropic",
    authStyle: "anthropic-auth-token",
    configJson: {},
  };
}

function makeDraftFromVendor(vendor: Vendor): VendorDraft {
  const configJson = vendor.configJson ?? {};
  const authStyle = vendor.authStyle ?? "anthropic-auth-token";

  // Convenience fields: prefer top-level values, fall back to env
  const env = getEnv(configJson);
  const baseUrl = vendor.baseUrl || (env.ANTHROPIC_BASE_URL as string | undefined) || "";
  const apiKey = vendor.apiKey ?? (env[authEnvKey(authStyle)] as string | undefined);
  const fallbackModel =
    vendor.fallbackModel ?? (env.ANTHROPIC_MODEL as string | undefined) ?? undefined;

  return {
    id: vendor.id,
    name: vendor.name,
    notes: vendor.notes,
    websiteUrl: vendor.websiteUrl,
    baseUrl,
    apiKey,
    apiFormat: vendor.apiFormat,
    authStyle,
    fallbackModel,
    configJson,
    models: vendor.models,
    exposedModelIds: vendor.exposedModelIds,
    defaultModelId: vendor.defaultModelId,
    source: vendor.source,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(draft: VendorDraft): Partial<Record<keyof VendorDraft, string>> {
  const errors: Partial<Record<keyof VendorDraft, string>> = {};
  if (!draft.name.trim()) {
    errors.name = "Name is required";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface DraftState {
  draft: VendorDraft;
  configJsonText: string;
  jsonParseError: string | null;
}

function makeDraftState(draft: VendorDraft): DraftState {
  return {
    draft,
    configJsonText: JSON.stringify(draft.configJson, null, 2),
    jsonParseError: null,
  };
}

export function useVendorDraft(
  initial: Vendor | undefined,
  _cli: "claude" | "codex",
): {
  draft: VendorDraft;
  setField: <K extends keyof VendorDraft>(k: K, v: VendorDraft[K]) => void;
  setConfigJsonText: (text: string) => { ok: boolean; error?: string };
  configJsonText: string;
  toggleQuick: (key: QuickToggleKey, on: boolean) => void;
  errors: Partial<Record<keyof VendorDraft, string>>;
  toVendor: () => Vendor;
  isValid: boolean;
  isJsonValid: boolean;
  /** Replace fetched models; merges with existing manual/cc-switch items (dedupe by id). */
  setModels: (models: VendorModel[]) => void;
  /** Toggle whether a model id appears in exposedModelIds. */
  toggleExposed: (modelId: string, on: boolean) => void;
  /** Push a manual model (auto-exposed, deduplicated). */
  addManualModel: (id: string) => void;
  /** Set the default model id; only succeeds if the id is already exposed. */
  setDefaultModel: (modelId: string) => void;
  /** Remove a manually-added model (and clean up exposed/default if needed). */
  removeModel: (modelId: string) => void;
} {
  const [state, setState] = useState<DraftState>(() => {
    const draft = initial ? makeDraftFromVendor(initial) : makeDefaultDraft();
    return makeDraftState(draft);
  });

  // Fix 1: reset draft when vendor identity changes (fixes always-mounted native bottom sheet).
  // Track the identity key from the previous render to detect vendor switches.
  const prevIdentityRef = useRef<string | undefined>(initial?.id ?? "__new__");
  useEffect(() => {
    const identity = initial?.id ?? "__new__";
    if (identity !== prevIdentityRef.current) {
      prevIdentityRef.current = identity;
      const draft = initial ? makeDraftFromVendor(initial) : makeDefaultDraft();
      setState(makeDraftState(draft));
    }
  }, [initial, initial?.id]);

  const errors = validate(state.draft);
  const isJsonValid = state.jsonParseError === null;
  const isValid = Object.keys(errors).length === 0 && isJsonValid;

  const setField = <K extends keyof VendorDraft>(k: K, v: VendorDraft[K]) => {
    setState((prev) => {
      const draft = { ...prev.draft, [k]: v };
      let { configJson } = draft;
      let configJsonText = prev.configJsonText;

      // Bidirectional sync: certain fields mirror into configJson.env.*
      if (k === "baseUrl") {
        configJson = setEnvKey(configJson, "ANTHROPIC_BASE_URL", v as string);
        draft.configJson = configJson;
        configJsonText = JSON.stringify(configJson, null, 2);
      } else if (k === "apiKey") {
        configJson = setEnvKey(configJson, authEnvKey(draft.authStyle), v as string | undefined);
        draft.configJson = configJson;
        configJsonText = JSON.stringify(configJson, null, 2);
      } else if (k === "fallbackModel") {
        configJson = setEnvKey(configJson, "ANTHROPIC_MODEL", v as string | undefined);
        draft.configJson = configJson;
        configJsonText = JSON.stringify(configJson, null, 2);
      } else if (k === "authStyle") {
        // Migrate apiKey from old env var to new env var
        const oldAuthStyle = prev.draft.authStyle;
        const newAuthStyle = v as VendorDraft["authStyle"];
        const oldEnvKey = authEnvKey(oldAuthStyle);
        const newEnvKey = authEnvKey(newAuthStyle);
        if (oldEnvKey !== newEnvKey) {
          const oldEnvValue = getEnv(configJson)[oldEnvKey];
          // Remove old key
          configJson = setEnvKey(configJson, oldEnvKey, undefined);
          // Write to new key if there was a value
          if (oldEnvValue) {
            configJson = setEnvKey(configJson, newEnvKey, oldEnvValue);
          }
          draft.configJson = configJson;
          configJsonText = JSON.stringify(configJson, null, 2);
        }
      }

      return {
        draft,
        configJsonText,
        jsonParseError: prev.jsonParseError,
      };
    });
  };

  const setConfigJsonText = (text: string): { ok: boolean; error?: string } => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid JSON";
      setState((prev) => ({
        ...prev,
        configJsonText: text,
        jsonParseError: msg,
      }));
      return { ok: false, error: msg };
    }

    setState((prev) => {
      const back = backFillFromConfigJson(parsed, prev.draft.authStyle);
      const draft: VendorDraft = {
        ...prev.draft,
        configJson: parsed,
        baseUrl: back.baseUrl,
        apiKey: back.apiKey,
        fallbackModel: back.fallbackModel,
      };
      return {
        draft,
        configJsonText: text,
        jsonParseError: null,
      };
    });

    return { ok: true };
  };

  const toggleQuick = (key: QuickToggleKey, on: boolean) => {
    setState((prev) => {
      const configJson = applyQuickToggle(prev.draft.configJson, key, on);
      const draft = { ...prev.draft, configJson };
      return {
        draft,
        configJsonText: JSON.stringify(configJson, null, 2),
        jsonParseError: prev.jsonParseError,
      };
    });
  };

  const toVendor = (): Vendor => {
    const { draft } = state;
    const id = draft.id ?? `vnd_${Math.random().toString(36).slice(2, 10)}`;
    return {
      id,
      name: draft.name.trim(),
      notes: draft.notes,
      websiteUrl: draft.websiteUrl,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey,
      apiFormat: draft.apiFormat,
      authStyle: draft.authStyle,
      fallbackModel: draft.fallbackModel,
      configJson: draft.configJson,
      models: draft.models,
      exposedModelIds: draft.exposedModelIds,
      defaultModelId: draft.defaultModelId,
      source: draft.source,
    };
  };

  // ---------------------------------------------------------------------------
  // Model setters
  // ---------------------------------------------------------------------------

  const setModels = (fetchedModels: VendorModel[]) => {
    setState((prev) => {
      // Keep existing manual / cc-switch items; replace fetched ones.
      const existingManual = (prev.draft.models ?? []).filter(
        (m) => m.source === "manual" || m.source === "cc-switch",
      );
      // Build an id-keyed map of manual items
      const manualById = new Map(existingManual.map((m) => [m.id, m]));
      // Merge: start with fetched, then overlay manual (manual wins on id collision)
      const merged = fetchedModels.map((m) => manualById.get(m.id) ?? m);
      // Append any manual items that weren't in the fetch result
      for (const m of existingManual) {
        if (!merged.some((r) => r.id === m.id)) {
          merged.push(m);
        }
      }
      return {
        ...prev,
        draft: { ...prev.draft, models: merged },
      };
    });
  };

  const toggleExposed = (modelId: string, on: boolean) => {
    setState((prev) => {
      const current = prev.draft.exposedModelIds ?? [];
      let next: string[];
      if (on) {
        next = current.includes(modelId) ? current : [...current, modelId];
      } else {
        next = current.filter((id) => id !== modelId);
      }
      // Clear defaultModelId if it was deselected
      const defaultModelId =
        prev.draft.defaultModelId && !next.includes(prev.draft.defaultModelId)
          ? undefined
          : prev.draft.defaultModelId;
      return {
        ...prev,
        draft: { ...prev.draft, exposedModelIds: next, defaultModelId },
      };
    });
  };

  const addManualModel = (id: string) => {
    setState((prev) => {
      const alreadyExists = (prev.draft.models ?? []).some((m) => m.id === id);
      if (alreadyExists) return prev;
      const models = [...(prev.draft.models ?? []), { id, source: "manual" as const }];
      const exposedModelIds = (prev.draft.exposedModelIds ?? []).includes(id)
        ? (prev.draft.exposedModelIds ?? [])
        : [...(prev.draft.exposedModelIds ?? []), id];
      return {
        ...prev,
        draft: { ...prev.draft, models, exposedModelIds },
      };
    });
  };

  const setDefaultModel = (modelId: string) => {
    setState((prev) => {
      const exposed = prev.draft.exposedModelIds ?? [];
      if (!exposed.includes(modelId)) return prev;
      return {
        ...prev,
        draft: { ...prev.draft, defaultModelId: modelId },
      };
    });
  };

  const removeModel = (modelId: string) => {
    setState((prev) => {
      const models = (prev.draft.models ?? []).filter((m) => m.id !== modelId);
      const exposedModelIds = (prev.draft.exposedModelIds ?? []).filter((id) => id !== modelId);
      const defaultModelId =
        prev.draft.defaultModelId === modelId ? undefined : prev.draft.defaultModelId;
      return {
        ...prev,
        draft: { ...prev.draft, models, exposedModelIds, defaultModelId },
      };
    });
  };

  return {
    draft: state.draft,
    setField,
    setConfigJsonText,
    configJsonText: state.configJsonText,
    toggleQuick,
    errors,
    toVendor,
    isValid,
    isJsonValid,
    setModels,
    toggleExposed,
    addManualModel,
    setDefaultModel,
    removeModel,
  };
}

/** Reset hook: useful for effect-based re-initialization when modal opens. */
export function makeVendorDraft(initial: Vendor | undefined): VendorDraft {
  return initial ? makeDraftFromVendor(initial) : makeDefaultDraft();
}
