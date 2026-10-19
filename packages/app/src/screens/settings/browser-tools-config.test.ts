import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  createBrowserToolsPatch,
  getBrowserToolsCardState,
  getBrowserToolsMutationViewState,
} from "./browser-tools-config";

function makeConfig(browserToolsEnabled = false): MutableDaemonConfig {
  return {
    relay: { enabled: false },
    mcp: { injectIntoAgents: false },
    browserTools: { enabled: browserToolsEnabled },
    providers: {},
    metadataGeneration: { providers: [] },
    autoArchiveAfterMerge: false,
    enableTerminalAgentHooks: false,
    appendSystemPrompt: "",
  };
}

describe("browser tools opt-in config", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the card with the logged-in browser state warning when connected", () => {
    expect(
      getBrowserToolsCardState({ isConnected: true, config: makeConfig(false), t: i18n.t }),
    ).toEqual({
      isVisible: true,
      isEnabled: false,
      title: "Browser tools",
      warning:
        "Allow agents to access and control Paseo browser tabs, including logged-in browser state. Only enable this for agents you trust.",
    });
  });

  it("reads enabled state from daemon config", () => {
    expect(
      getBrowserToolsCardState({ isConnected: true, config: makeConfig(true), t: i18n.t }),
    ).toMatchObject({
      isEnabled: true,
    });
  });

  it("hides the card when the host is disconnected", () => {
    expect(
      getBrowserToolsCardState({ isConnected: false, config: makeConfig(true), t: i18n.t }),
    ).toMatchObject({
      isVisible: false,
    });
  });

  it("writes daemon.browserTools.enabled when toggled", () => {
    expect(createBrowserToolsPatch(true)).toEqual({ browserTools: { enabled: true } });
    expect(createBrowserToolsPatch(false)).toEqual({ browserTools: { enabled: false } });
  });

  it("shows loading and disables the toggle while browser tool settings save", () => {
    expect(getBrowserToolsMutationViewState({ isPending: true, error: null, t: i18n.t })).toEqual({
      isSwitchDisabled: true,
      loadingText: "Updating browser tools…",
      errorText: null,
    });
  });

  it("shows the save error when browser tool settings fail", () => {
    expect(
      getBrowserToolsMutationViewState({
        isPending: false,
        error: new Error("Disk full"),
        t: i18n.t,
      }),
    ).toEqual({
      isSwitchDisabled: false,
      loadingText: null,
      errorText: "Disk full",
    });
  });
});
