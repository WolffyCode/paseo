import type { ConversationTreeNode, SelectableConversationTreeNode } from "./types";

export interface ConversationSearchCandidate {
  readonly node: SelectableConversationTreeNode;
  readonly projectName: string | null;
}

export interface FindConversationSearchCandidatesInput {
  readonly nodes: readonly ConversationTreeNode[];
  readonly query: string;
}

/**
 * Flatten the tree into name-filtered conversation/subagent rows for the shell's own search
 * overlay (the shell-owned replacement for the old command center's candidate list, see
 * left-region.tsx). Never yields a project row — projects toggle collapse, they don't activate.
 */
export function findConversationSearchCandidates(
  input: FindConversationSearchCandidatesInput,
): ConversationSearchCandidate[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  const candidates: ConversationSearchCandidate[] = [];
  collectCandidates(input.nodes, null, normalizedQuery, candidates);
  return candidates;
}

/** Depth-first walk that threads the nearest owning project name down to each conversation. */
function collectCandidates(
  nodes: readonly ConversationTreeNode[],
  projectName: string | null,
  normalizedQuery: string,
  candidates: ConversationSearchCandidate[],
): void {
  for (const node of nodes) {
    if (node.kind === "project") {
      collectCandidates(node.children, node.title, normalizedQuery, candidates);
      continue;
    }
    if (normalizedQuery.length === 0 || node.title.toLowerCase().includes(normalizedQuery)) {
      candidates.push({ node, projectName });
    }
    collectCandidates(node.children, projectName, normalizedQuery, candidates);
  }
}
