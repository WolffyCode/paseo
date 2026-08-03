import { resolveSubmissionReadiness } from "@/provider-selection/provider-selection";

export interface WorkspaceDraftAutoSubmitConfig {
  provider: string;
  model: string | null;
}

export type WorkspaceDraftEmptyLayout = "centered" | "docked" | "docked-with-title";

export type WorkspaceDraftContentKind =
  | "stream"
  | "centered-title"
  | "docked-title"
  | "docked-error"
  | "none";

/** Select the one draft body presentation that owns the space above Composer. */
export function resolveWorkspaceDraftContentKind(input: {
  isSubmitting: boolean;
  hasDraftAgent: boolean;
  emptyLayout: WorkspaceDraftEmptyLayout;
  hasError: boolean;
}): WorkspaceDraftContentKind {
  if (input.isSubmitting && input.hasDraftAgent) return "stream";
  if (input.emptyLayout === "centered") return "centered-title";
  if (input.emptyLayout === "docked-with-title") return "docked-title";
  return input.hasError ? "docked-error" : "none";
}

/** Return the first user-actionable reason a new workspace draft cannot submit. */
export function validateDraftSubmission(input: {
  text: string;
  allowsEmptyAutoSubmit: boolean;
  composerState: {
    providerDefinitions: unknown[];
    selectedProvider: string | null;
    isModelLoading: boolean;
    effectiveModelId: string | null;
    availableModels: unknown[];
  };
  autoSubmitConfig: WorkspaceDraftAutoSubmitConfig | null;
  workspaceDirectory: string | null;
  requiresWorkspaceDirectory: boolean;
  hasClient: boolean;
}): string | null {
  const {
    text,
    allowsEmptyAutoSubmit,
    composerState,
    autoSubmitConfig,
    workspaceDirectory,
    requiresWorkspaceDirectory,
    hasClient,
  } = input;
  const readiness = resolveSubmissionReadiness({
    text,
    allowsEmptyAutoSubmit,
    providerCount: composerState.providerDefinitions.length,
    selection: {
      provider: composerState.selectedProvider,
      modelId: composerState.effectiveModelId ?? "",
      availableModels: composerState.availableModels,
      isModelLoading: composerState.isModelLoading,
    },
    autoSubmitConfig,
    workspaceDirectory,
    requiresWorkspaceDirectory,
    hasClient,
  });
  return readiness.ok ? null : (readiness.reason ?? null);
}
