import {
  useConversationModelSelection,
  type ConversationModelSelection,
  type ConversationModelSelectionComposerState,
} from "@/providers/use-conversation-model-selection";
import { useSupportsThreeLayerVendors } from "@/providers/use-three-layer-vendors";

/** Stable no-op fallback so useConversationModelSelection can always be called
 *  (Rules of Hooks) even when a composer has no draft state yet. */
export const NULL_VENDOR_COMPOSER_STATE: ConversationModelSelectionComposerState = {
  selectedProvider: null,
  selectedVendorId: null,
  selectedModel: "",
  setVendorIdFromUser: () => {},
  setModelFromUser: () => {},
};

/** Suppress the flat model picker when the cascade chip is active, so there is
 *  exactly one model-selection UI. True only when vendors are supported AND a
 *  provider is locked (the cascade chip renders exactly then). */
export function shouldHideModelSelector(
  supportsVendors: boolean,
  lockedProvider: string | null,
): boolean {
  return supportsVendors && lockedProvider !== null;
}

/**
 * Shared three-layer-vendor cascade wiring for draft composers: the capability
 * gate + the selection view-model, with a stable fallback when composerState is
 * null. Callers build their own agentControls/footer from the returned values.
 *
 * COMPAT(threeLayerVendors): added in v0.1.98, drop the gate when floor >= v0.1.98
 */
export function useVendorCascade(
  serverId: string,
  composerState: ConversationModelSelectionComposerState | null,
): { supportsVendors: boolean; modelSelection: ConversationModelSelection } {
  const supportsVendors = useSupportsThreeLayerVendors(serverId);
  const modelSelection = useConversationModelSelection(
    serverId,
    composerState ?? NULL_VENDOR_COMPOSER_STATE,
  );
  return { supportsVendors, modelSelection };
}
