import { useCallback, useEffect, useMemo } from "react";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { Vendor, VendorModel } from "@getpaseo/protocol/provider-config";
import { useVendors, type VendorCli } from "@/providers/use-vendors";

/**
 * The subset of composerState fields the view-model reads/writes.
 * Task 4.2 will pass composerState from useAgentInputDraft directly.
 */
export interface ConversationModelSelectionComposerState {
  selectedProvider: AgentProvider | null;
  selectedVendorId: string | null;
  selectedModel: string;
  setVendorIdFromUser: (vendorId: string | null) => void;
  setModelFromUser: (modelId: string) => void;
}

export interface ConversationModelSelection {
  /** Draft's provider — locked; UI must not allow switching. */
  lockedProvider: AgentProvider | null;
  /** CLI derived from provider; used to scope vendor list. */
  cli: VendorCli | null;
  /** null = direct-connect (no vendor) */
  vendorId: string | null;
  /** null when no model chosen */
  modelId: string | null;
  /** All vendors for the current CLI. */
  vendors: Vendor[];
  /**
   * Exposed models for the selected vendor.
   * vendor.models filtered to vendor.exposedModelIds;
   * if exposedModelIds is absent, all models are exposed.
   * Empty when vendorId is null (direct-connect).
   */
  exposedModels: VendorModel[];
  /**
   * Select a vendor by id (or null for direct-connect).
   * Also resets modelId: vendor.defaultModelId → first exposed → nothing.
   * Direct-connect (null) does NOT reset model.
   */
  selectVendor: (vendorId: string | null) => void;
  selectModel: (modelId: string) => void;
}

/** Maps an AgentProvider to its VendorCli, or null for providers that don't use vendors. */
function providerToCli(provider: AgentProvider | null): VendorCli | null {
  if (provider === "claude" || provider === "codex") {
    return provider;
  }
  return null;
}

/** Resolve exposed models for a vendor. */
function resolveExposedModels(vendor: Vendor): VendorModel[] {
  const models = vendor.models ?? [];
  const { exposedModelIds } = vendor;
  if (!exposedModelIds) {
    return models;
  }
  const idSet = new Set(exposedModelIds);
  return models.filter((m) => idSet.has(m.id));
}

/** Resolve the model to select when switching to a vendor. */
function resolveVendorDefaultModel(vendor: Vendor): string | null {
  if (vendor.defaultModelId) {
    return vendor.defaultModelId;
  }
  const exposed = resolveExposedModels(vendor);
  return exposed[0]?.id ?? null;
}

/**
 * View-model for the cascade vendor/model picker (Task 4.2).
 *
 * @param serverId - Server to load vendors from.
 * @param composerState - Slice of the draft's composerState (from useAgentInputDraft).
 */
export function useConversationModelSelection(
  serverId: string,
  composerState: ConversationModelSelectionComposerState,
): ConversationModelSelection {
  const { vendorsForSelectedCli, setSelectedCli } = useVendors(serverId);

  const cli = useMemo(
    () => providerToCli(composerState.selectedProvider),
    [composerState.selectedProvider],
  );

  // Keep useVendors's internal selectedCli in sync with the draft's provider.
  useEffect(() => {
    if (cli) {
      setSelectedCli(cli);
    }
  }, [cli, setSelectedCli]);

  const currentVendor = useMemo(
    () =>
      composerState.selectedVendorId
        ? (vendorsForSelectedCli.find((v) => v.id === composerState.selectedVendorId) ?? null)
        : null,
    [composerState.selectedVendorId, vendorsForSelectedCli],
  );

  const exposedModels = useMemo<VendorModel[]>(
    () => (currentVendor ? resolveExposedModels(currentVendor) : []),
    [currentVendor],
  );

  const selectVendor = useCallback(
    (vendorId: string | null) => {
      composerState.setVendorIdFromUser(vendorId);
      if (vendorId === null) {
        // Direct-connect: don't reset model, let provider defaults handle it.
        return;
      }
      const vendor = vendorsForSelectedCli.find((v) => v.id === vendorId);
      if (vendor) {
        const defaultModel = resolveVendorDefaultModel(vendor);
        if (defaultModel) {
          composerState.setModelFromUser(defaultModel);
        }
      }
    },
    [composerState, vendorsForSelectedCli],
  );

  const selectModel = useCallback(
    (modelId: string) => {
      composerState.setModelFromUser(modelId);
    },
    [composerState],
  );

  const modelId = composerState.selectedModel || null;

  return useMemo<ConversationModelSelection>(
    () => ({
      lockedProvider: composerState.selectedProvider,
      cli,
      vendorId: composerState.selectedVendorId,
      modelId,
      vendors: vendorsForSelectedCli,
      exposedModels,
      selectVendor,
      selectModel,
    }),
    [
      composerState.selectedProvider,
      composerState.selectedVendorId,
      cli,
      modelId,
      vendorsForSelectedCli,
      exposedModels,
      selectVendor,
      selectModel,
    ],
  );
}
