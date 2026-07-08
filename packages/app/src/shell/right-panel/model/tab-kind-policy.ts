// The one static policy table for the five tab types: how each instances, whether it is usable this
// round, whether to badge it "coming soon", and its launcher shortcut hint. The launcher + new-tab
// dropdown render a static projection of this table directly; dedup + single-instance read `instancing`
// from it. It is data, not a function — there is no dynamic input to derive, so no deriveLauncherItems
// wrapper (YAGNI). This round only `file` is enabled; the other four are deferred roadmap rows.

import type { TabKind } from "./tab-content";

export interface TabKindPolicy {
  readonly instancing: "single" | "multi";
  readonly enabled: boolean;
  readonly comingSoon: boolean;
  readonly shortcutHint?: string;
}

export const TAB_KIND_POLICY: Record<TabKind, TabKindPolicy> = {
  file: { instancing: "multi", enabled: true, comingSoon: false, shortcutHint: "⌘P" },
  conversation: { instancing: "multi", enabled: false, comingSoon: true },
  browser: { instancing: "multi", enabled: false, comingSoon: true },
  review: { instancing: "single", enabled: false, comingSoon: true },
  terminal: { instancing: "multi", enabled: false, comingSoon: true },
};
