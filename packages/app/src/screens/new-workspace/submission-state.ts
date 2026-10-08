export type ConversationSubmissionState =
  | "ready"
  | "pending"
  | "offline"
  | "directory-unavailable"
  | "update-required";

interface ConversationSubmissionInput {
  pending: boolean;
  draftReady: boolean;
  connected: boolean;
  hasProject: boolean;
  hasDirectory: boolean;
  supportsIndependentChats: boolean;
}

export function resolveConversationSubmissionState(
  input: ConversationSubmissionInput,
): ConversationSubmissionState {
  if (input.pending || !input.draftReady) return "pending";
  if (!input.connected) return "offline";
  if (input.hasProject) return input.hasDirectory ? "ready" : "directory-unavailable";
  return input.supportsIndependentChats ? "ready" : "update-required";
}
