import { describe, expect, test } from "vitest";
import { resolveProviderBadge } from "./provider-label";

describe("resolveProviderBadge", () => {
  test("resolves every built-in provider label and its tree icon", () => {
    expect(resolveProviderBadge("claude")).toEqual({ label: "Claude", icon: "claude" });
    expect(resolveProviderBadge("codex")).toEqual({ label: "Codex", icon: "codex" });
    expect(resolveProviderBadge("copilot")).toEqual({ label: "Copilot", icon: "copilot" });
    expect(resolveProviderBadge("opencode")).toEqual({ label: "OpenCode", icon: "opencode" });
    expect(resolveProviderBadge("pi")).toEqual({ label: "Pi", icon: "pi" });
  });

  test("resolves the sixth built-in provider without inventing an icon", () => {
    expect(resolveProviderBadge("omp")).toEqual({ label: "OMP", icon: null });
  });

  test("falls back to the raw custom provider id instead of throwing", () => {
    expect(resolveProviderBadge("team-agent")).toEqual({ label: "team-agent", icon: null });
  });
});
