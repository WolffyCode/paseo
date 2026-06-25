import { describe, expect, it, vi } from "vitest";

import { toggleDesktopSidebarsWithCheckoutIntent } from "./desktop-sidebar-toggle";

describe("toggleDesktopSidebarsWithCheckoutIntent", () => {
  it("closes the agent list when it is open", () => {
    const openAgentList = vi.fn();
    const closeAgentList = vi.fn();

    const handled = toggleDesktopSidebarsWithCheckoutIntent({
      isAgentListOpen: true,
      openAgentList,
      closeAgentList,
    });

    expect(handled).toBe(true);
    expect(closeAgentList).toHaveBeenCalledTimes(1);
    expect(openAgentList).not.toHaveBeenCalled();
  });

  it("opens the agent list when it is closed", () => {
    const openAgentList = vi.fn();
    const closeAgentList = vi.fn();

    const handled = toggleDesktopSidebarsWithCheckoutIntent({
      isAgentListOpen: false,
      openAgentList,
      closeAgentList,
    });

    expect(handled).toBe(true);
    expect(openAgentList).toHaveBeenCalledTimes(1);
    expect(closeAgentList).not.toHaveBeenCalled();
  });
});
