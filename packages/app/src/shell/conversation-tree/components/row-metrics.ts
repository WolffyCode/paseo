import type { ConversationTreeSectionId } from "./tree-section-header";
import type { ConversationTreeRow } from "../model/types";

export const ROW_HEIGHTS = {
  project: 48,
  conversation: 48,
  subagent: 30,
} as const;

export const SECTION_HEIGHT = 30;
export const EMPTY_HINT_HEIGHT = 30;

export type ConversationTreePanelItem =
  | {
      readonly kind: "section";
      readonly key: string;
      readonly section: ConversationTreeSectionId;
      readonly actionAlwaysVisible: boolean;
    }
  | { readonly kind: "row"; readonly key: string; readonly row: ConversationTreeRow }
  | {
      readonly kind: "empty";
      readonly key: string;
      readonly indented: boolean;
      readonly testID: string;
    };

/** Return the exact static height shared by a panel item renderer and FlatList layout math. */
export function itemHeight(item: ConversationTreePanelItem): number {
  if (item.kind === "section") {
    return SECTION_HEIGHT;
  }
  if (item.kind === "empty") {
    return EMPTY_HINT_HEIGHT;
  }
  return ROW_HEIGHTS[item.row.node.kind];
}

/** Build prefix-sum offsets so mixed-height rows remain O(1) to locate in the virtualized list. */
export function buildItemOffsets(items: readonly ConversationTreePanelItem[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const item of items) {
    offsets.push(offset);
    offset += itemHeight(item);
  }
  return offsets;
}

/** Provide FlatList's static layout tuple from the same item heights used by row styles. */
export function getPanelItemLayout(
  items: readonly ConversationTreePanelItem[],
  offsets: readonly number[],
  index: number,
): { length: number; offset: number; index: number } {
  const item = items[index];
  if (item === undefined) {
    return { length: 0, offset: offsets[index] ?? 0, index };
  }
  return { length: itemHeight(item), offset: offsets[index] ?? 0, index };
}
