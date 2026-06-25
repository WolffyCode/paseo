import { useSessionStore } from "@/stores/session-store";

/**
 * Returns true when the connected daemon advertises the threeLayerVendors
 * capability (added in v0.1.98).
 *
 * When false (old daemon or not connected) the three-layer vendor UI
 * (ProvidersSection, ConversationModelPicker cascade chip, fetchVendorModels
 * and syncCcSwitch RPCs) MUST NOT be rendered or fired — an old daemon has no
 * handler and the client would hang for 30 s waiting for a response.
 *
 * // COMPAT(threeLayerVendors): added in v0.1.98, drop the gate when floor >= v0.1.98
 */
export function useSupportsThreeLayerVendors(serverId: string): boolean {
  return useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.threeLayerVendors === true,
  );
}
