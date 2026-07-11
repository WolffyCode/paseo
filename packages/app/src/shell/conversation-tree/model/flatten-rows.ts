import type { ConversationTreeNode, ConversationTreeRow } from "./types";

export interface FlattenTreeRowsOptions {
  readonly isCollapsed: (node: ConversationTreeNode) => boolean;
  readonly maxDepth: number;
}

/** Project a recursive tree into visible rows without changing the tree's aggregate metadata. */
export function flattenTreeRows(
  nodes: readonly ConversationTreeNode[],
  options: FlattenTreeRowsOptions,
): ConversationTreeRow[] {
  const rows: ConversationTreeRow[] = [];

  /** Append one visible branch and recurse only while its expansion remains representable. */
  function visit(node: ConversationTreeNode, depth: number): void {
    const childrenWithinDepth = depth < options.maxDepth;
    const hasExpandableContent = node.kind === "project" || node.children.length > 0;
    const canExpand = childrenWithinDepth && hasExpandableContent;
    const isExpanded = canExpand && !options.isCollapsed(node);
    rows.push({ node, depth, canExpand, isExpanded });
    if (!isExpanded) {
      return;
    }
    for (const child of node.children) {
      visit(child, depth + 1);
    }
  }

  for (const node of nodes) {
    visit(node, 0);
  }
  return rows;
}
