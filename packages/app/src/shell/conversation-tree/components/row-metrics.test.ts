import { describe, expect, test } from "vitest";
import {
  buildItemOffsets,
  getPanelItemLayout,
  itemHeight,
  ROW_HEIGHTS,
  type ConversationTreePanelItem,
} from "./row-metrics";

const ITEMS: readonly ConversationTreePanelItem[] = [
  { kind: "section", key: "section:projects", section: "projects", actionAlwaysVisible: false },
  {
    kind: "row",
    key: "row:project",
    row: {
      node: {
        kind: "project",
        id: "project",
        title: "Project",
        workspaceId: null,
        runStatus: null,
        subagentCount: 0,
        branch: "main",
        diffStat: null,
        children: [],
      },
      depth: 0,
      canExpand: true,
      isExpanded: true,
    },
  },
  {
    kind: "row",
    key: "row:conversation",
    row: {
      node: {
        kind: "conversation",
        id: "conversation",
        title: "Conversation",
        workspaceId: "workspace",
        runStatus: "idle",
        updatedAt: "2026-07-24T00:00:00.000Z",
        providerId: "claude",
        attentionKind: null,
        subagentCount: 0,
        children: [],
      },
      depth: 1,
      canExpand: false,
      isExpanded: false,
    },
  },
  {
    kind: "row",
    key: "row:subagent",
    row: {
      node: {
        kind: "subagent",
        id: "subagent",
        title: "Subagent",
        workspaceId: null,
        runStatus: "running",
        subagentCount: 0,
        children: [],
      },
      depth: 2,
      canExpand: false,
      isExpanded: false,
    },
  },
  { kind: "empty", key: "empty", indented: true, testID: "empty" },
];

describe("row metrics", () => {
  test("uses the three static row heights and keeps non-row item heights explicit", () => {
    expect(ROW_HEIGHTS).toEqual({ project: 48, conversation: 48, subagent: 30 });
    expect(ITEMS.map(itemHeight)).toEqual([30, 48, 48, 30, 30]);
  });

  test("builds strictly increasing offsets and matching FlatList layout tuples", () => {
    const offsets = buildItemOffsets(ITEMS);
    expect(offsets).toEqual([0, 30, 78, 126, 156]);
    expect(offsets.every((offset, index) => index === 0 || offset > offsets[index - 1]!)).toBe(
      true,
    );
    expect(getPanelItemLayout(ITEMS, offsets, 2)).toEqual({ length: 48, offset: 78, index: 2 });
  });
});
