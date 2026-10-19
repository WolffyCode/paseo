import type { TFunction } from "i18next";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";

export interface BrowserToolsCardState {
  isVisible: boolean;
  isEnabled: boolean;
  title: string;
  warning: string;
}

export interface BrowserToolsMutationViewState {
  isSwitchDisabled: boolean;
  loadingText: string | null;
  errorText: string | null;
}

export function getBrowserToolsCardState(input: {
  isConnected: boolean;
  config: MutableDaemonConfig | null;
  t: TFunction;
}): BrowserToolsCardState {
  return {
    isVisible: input.isConnected,
    isEnabled: input.config?.browserTools.enabled === true,
    title: input.t("settings.host.agents.browserTools.title"),
    warning: input.t("settings.host.agents.browserTools.hint"),
  };
}

export function createBrowserToolsPatch(enabled: boolean): Partial<MutableDaemonConfig> {
  return { browserTools: { enabled } };
}

export function getBrowserToolsMutationViewState(input: {
  isPending: boolean;
  error: unknown;
  t: TFunction;
}): BrowserToolsMutationViewState {
  return {
    isSwitchDisabled: input.isPending,
    loadingText: input.isPending ? input.t("settings.host.agents.browserTools.updating") : null,
    errorText: input.error ? toErrorMessage(input.error) : null,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
