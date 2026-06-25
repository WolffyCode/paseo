import { describe, it, expect } from "vitest";
import { VendorSchema, VendorsByCliSchema } from "./provider-config.js";

describe("VendorSchema", () => {
  it("accepts a minimal claude vendor", () => {
    const v = VendorSchema.parse({
      id: "vnd_1",
      name: "质谱glm5.0",
      baseUrl: "https://api.z.ai/api/anthropic",
      apiKey: "k",
      apiFormat: "anthropic",
      authStyle: "anthropic-auth-token",
    });
    expect(v.name).toBe("质谱glm5.0");
    expect(v.enabled).toBeUndefined();
  });
  it("rejects missing baseUrl", () => {
    expect(() =>
      VendorSchema.parse({
        id: "x",
        name: "n",
        apiFormat: "anthropic",
        authStyle: "openai-api-key",
      }),
    ).toThrow();
  });
  it("keys vendors by cli", () => {
    const m = VendorsByCliSchema.parse({ claude: [], codex: [] });
    expect(Object.keys(m)).toEqual(["claude", "codex"]);
  });
  it("accepts a partial map with only claude key", () => {
    const m = VendorsByCliSchema.parse({ claude: [] });
    expect(m.claude).toEqual([]);
    expect(m.codex).toBeUndefined();
  });
});
