import { describe, expect, it, vi } from "vitest";
import { commitProviderDrillDown } from "./combined-model-selector-model";

describe("commitProviderDrillDown", () => {
  it("commits the provider and opens its model view", () => {
    const onSelectProvider = vi.fn();

    expect(commitProviderDrillDown("claude", "Claude", onSelectProvider)).toEqual({
      kind: "provider",
      providerId: "claude",
      providerLabel: "Claude",
    });
    expect(onSelectProvider).toHaveBeenCalledOnce();
    expect(onSelectProvider).toHaveBeenCalledWith("claude");
  });

  it("still opens the provider model view when the provider is locked", () => {
    expect(commitProviderDrillDown("codex", "Codex")).toEqual({
      kind: "provider",
      providerId: "codex",
      providerLabel: "Codex",
    });
  });
});
