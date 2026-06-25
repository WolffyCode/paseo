import type { VendorModel } from "@getpaseo/protocol/provider-config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface VendorModelsFetchInput {
  baseUrl: string;
  apiKey?: string;
  /** "openai" → GET /v1/models with Authorization: Bearer; "anthropic" → per authStyle */
  apiFormat: "openai" | "anthropic";
  authStyle: "anthropic-auth-token" | "anthropic-api-key" | "openai-api-key";
}

export interface VendorModelsFetchDeps {
  fetch?: typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class VendorModelsFetchError extends Error {
  public readonly status?: number;
  public readonly reason: string;

  constructor(reason: string, opts?: { status?: number; cause?: unknown }) {
    super(reason);
    this.name = "VendorModelsFetchError";
    this.reason = reason;
    this.status = opts?.status;
    if (opts?.cause !== undefined) {
      this.cause = opts.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Header builders
// ---------------------------------------------------------------------------

function buildHeaders(input: VendorModelsFetchInput): Record<string, string> {
  const { apiFormat, authStyle, apiKey } = input;

  if (apiFormat === "openai") {
    // openai-api-key style — always Bearer
    const headers: Record<string, string> = {};
    if (apiKey != null) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  // anthropic format — depends on authStyle
  if (authStyle === "anthropic-api-key") {
    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
    };
    if (apiKey != null) {
      headers["x-api-key"] = apiKey;
    }
    return headers;
  }

  // anthropic-auth-token
  const headers: Record<string, string> = {};
  if (apiKey != null) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Core fetcher
// ---------------------------------------------------------------------------

export async function fetchVendorModels(
  input: VendorModelsFetchInput,
  deps?: VendorModelsFetchDeps,
): Promise<VendorModel[]> {
  const doFetch = deps?.fetch ?? globalThis.fetch;

  // Normalize trailing slash so we don't get //v1/models
  const base = input.baseUrl.replace(/\/+$/, "");
  const url = `${base}/v1/models`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: buildHeaders(input),
    });
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new VendorModelsFetchError(`Network error: ${msg}`, { cause });
  }

  if (!response.ok) {
    throw new VendorModelsFetchError(`HTTP ${response.status}`, {
      status: response.status,
    });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new VendorModelsFetchError("Failed to parse JSON response", { cause });
  }

  // Most relays return { data: [{id},...] }; fall back to { models: [{id},...] }
  const raw = body as Record<string, unknown>;
  let items: { id?: unknown }[] | null;
  if (Array.isArray(raw["data"])) {
    items = raw["data"] as { id?: unknown }[];
  } else if (Array.isArray(raw["models"])) {
    items = raw["models"] as { id?: unknown }[];
  } else {
    items = null;
  }

  if (items === null) {
    throw new VendorModelsFetchError(
      "Response body did not contain a parseable model array (expected data[] or models[])",
    );
  }

  const models: VendorModel[] = [];
  for (const item of items) {
    if (typeof item === "object" && item !== null && typeof item["id"] === "string") {
      models.push({ id: item["id"], source: "fetched" });
    }
  }

  return models;
}
