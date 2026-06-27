import type { ServerCapabilityState } from "@getpaseo/protocol/messages";
import type { DaemonServerInfo } from "@/stores/session-store";

export type VoiceReadinessMode = "dictation" | "voice";

/**
 * Whether the daemon emits the normalized nested-subagent tree, gating native-tree rendering.
 * Missing/false/null all mean the host predates the capability, so the client shows "Update the
 * host" instead of degrading — no fallback rendering path.
 */
export function selectObservedTreeCapability(
  serverInfo: DaemonServerInfo | null | undefined,
): boolean {
  return serverInfo?.features?.observedSubagentTree === true;
}

export function getServerCapabilities(params: {
  serverInfo: DaemonServerInfo | null | undefined;
}): DaemonServerInfo["capabilities"] | null {
  const capabilities = params.serverInfo?.capabilities;
  if (!capabilities) {
    return null;
  }
  return capabilities;
}

export function getVoiceReadinessState(params: {
  serverInfo: DaemonServerInfo | null | undefined;
  mode: VoiceReadinessMode;
}): ServerCapabilityState | null {
  const capabilities = getServerCapabilities({ serverInfo: params.serverInfo });
  const voice = capabilities?.voice;
  if (!voice) {
    return null;
  }
  if (params.mode === "dictation") {
    return voice.dictation;
  }
  return voice.voice;
}

export function resolveVoiceUnavailableMessage(params: {
  serverInfo: DaemonServerInfo | null | undefined;
  mode: VoiceReadinessMode;
}): string | null {
  const readiness = getVoiceReadinessState({
    serverInfo: params.serverInfo,
    mode: params.mode,
  });
  if (!readiness) {
    return null;
  }
  if (readiness.enabled && readiness.reason.trim().length === 0) {
    return null;
  }
  const message = readiness.reason.trim();
  if (message.length > 0) {
    return message;
  }
  return null;
}
