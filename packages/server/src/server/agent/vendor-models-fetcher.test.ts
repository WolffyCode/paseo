import { describe, expect, test } from "vitest";
import { fetchVendorModels, VendorModelsFetchError } from "./vendor-models-fetcher.js";

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

function makeFakeFetch(response: { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  return async (_url: string, _init?: RequestInit): Promise<Response> => {
    return {
      ok: response.ok,
      status: response.status ?? 200,
      json: response.json ?? (() => Promise.resolve({})),
    } as unknown as Response;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchVendorModels", () => {
  describe("openai format", () => {
    test("fetches models via GET /v1/models with Bearer auth", async () => {
      const capturedRequests: { url: string; init?: RequestInit }[] = [];

      const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
        capturedRequests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [{ id: "gpt-5.5" }, { id: "o4" }] }),
        } as unknown as Response;
      };

      const models = await fetchVendorModels(
        {
          baseUrl: "https://api.openai-relay.example.com",
          apiKey: "k",
          apiFormat: "openai",
          authStyle: "openai-api-key",
        },
        { fetch: fakeFetch },
      );

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0].url).toBe("https://api.openai-relay.example.com/v1/models");
      const headers = capturedRequests[0].init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer k");
      expect(models).toEqual([
        { id: "gpt-5.5", source: "fetched" },
        { id: "o4", source: "fetched" },
      ]);
    });

    test("strips trailing slash from baseUrl before appending path", async () => {
      const capturedUrls: string[] = [];

      const fakeFetch = async (url: string): Promise<Response> => {
        capturedUrls.push(url);
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [{ id: "gpt-4o" }] }),
        } as unknown as Response;
      };

      await fetchVendorModels(
        {
          baseUrl: "https://api.example.com/",
          apiFormat: "openai",
          authStyle: "openai-api-key",
        },
        { fetch: fakeFetch },
      );

      expect(capturedUrls[0]).toBe("https://api.example.com/v1/models");
    });

    test("falls back to models[] when data[] is absent", async () => {
      const models = await fetchVendorModels(
        {
          baseUrl: "https://api.example.com",
          apiFormat: "openai",
          authStyle: "openai-api-key",
        },
        {
          fetch: makeFakeFetch({
            ok: true,
            json: () => Promise.resolve({ models: [{ id: "some-model" }] }),
          }),
        },
      );

      expect(models).toEqual([{ id: "some-model", source: "fetched" }]);
    });
  });

  describe("anthropic format — api-key auth style", () => {
    test("fetches with x-api-key and anthropic-version headers", async () => {
      const capturedRequests: { url: string; init?: RequestInit }[] = [];

      const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
        capturedRequests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [{ id: "claude-4" }, { id: "claude-3-7" }] }),
        } as unknown as Response;
      };

      const models = await fetchVendorModels(
        {
          baseUrl: "https://relay.anthropic-style.example.com",
          apiKey: "k",
          apiFormat: "anthropic",
          authStyle: "anthropic-api-key",
        },
        { fetch: fakeFetch },
      );

      const headers = capturedRequests[0].init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("k");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["Authorization"]).toBeUndefined();
      expect(models).toEqual([
        { id: "claude-4", source: "fetched" },
        { id: "claude-3-7", source: "fetched" },
      ]);
    });
  });

  describe("anthropic format — auth-token style", () => {
    test("fetches with Authorization Bearer header", async () => {
      const capturedRequests: { url: string; init?: RequestInit }[] = [];

      const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
        capturedRequests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [{ id: "claude-3-5-sonnet" }] }),
        } as unknown as Response;
      };

      await fetchVendorModels(
        {
          baseUrl: "https://relay.token-style.example.com",
          apiKey: "bearer-token-123",
          apiFormat: "anthropic",
          authStyle: "anthropic-auth-token",
        },
        { fetch: fakeFetch },
      );

      const headers = capturedRequests[0].init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer bearer-token-123");
      expect(headers["x-api-key"]).toBeUndefined();
    });
  });

  describe("error handling", () => {
    test("throws VendorModelsFetchError with status on non-2xx response", async () => {
      await expect(
        fetchVendorModels(
          {
            baseUrl: "https://api.example.com",
            apiKey: "bad-key",
            apiFormat: "openai",
            authStyle: "openai-api-key",
          },
          {
            fetch: makeFakeFetch({ ok: false, status: 401 }),
          },
        ),
      ).rejects.toMatchObject(
        Object.assign(new VendorModelsFetchError("HTTP 401", { status: 401 }), {}),
      );
    });

    test("thrown error is a VendorModelsFetchError with status field", async () => {
      let caught: unknown;
      try {
        await fetchVendorModels(
          {
            baseUrl: "https://api.example.com",
            apiKey: "bad-key",
            apiFormat: "openai",
            authStyle: "openai-api-key",
          },
          {
            fetch: makeFakeFetch({ ok: false, status: 401 }),
          },
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(VendorModelsFetchError);
      const fetchErr = caught as VendorModelsFetchError;
      expect(fetchErr.status).toBe(401);
    });

    test("throws VendorModelsFetchError on network failure", async () => {
      const failFetch = async (): Promise<Response> => {
        throw new Error("network unreachable");
      };

      await expect(
        fetchVendorModels(
          {
            baseUrl: "https://api.example.com",
            apiFormat: "openai",
            authStyle: "openai-api-key",
          },
          { fetch: failFetch },
        ),
      ).rejects.toBeInstanceOf(VendorModelsFetchError);
    });

    test("throws VendorModelsFetchError when response body has no parseable model array", async () => {
      await expect(
        fetchVendorModels(
          {
            baseUrl: "https://api.example.com",
            apiFormat: "openai",
            authStyle: "openai-api-key",
          },
          {
            fetch: makeFakeFetch({
              ok: true,
              json: () => Promise.resolve({ unexpected: "shape" }),
            }),
          },
        ),
      ).rejects.toBeInstanceOf(VendorModelsFetchError);
    });
  });
});
