// The one static policy table for the five tab types: instancing, implementation availability, roadmap
// badge, and visibility in each creation surface. File remains implemented for path-bearing opens from
// tree/conversation but is absent from launcher/new-tab; the four deferred kinds stay visible there.

import type { TabKind } from "./tab-content";

export interface TabKindPolicy {
  readonly instancing: "single" | "multi";
  readonly enabled: boolean;
  readonly comingSoon: boolean;
  readonly showInLauncher: boolean;
  readonly showInNewTab: boolean;
}

export const TAB_KIND_POLICY: Record<TabKind, TabKindPolicy> = {
  file: {
    instancing: "multi",
    enabled: true,
    comingSoon: false,
    showInLauncher: false,
    showInNewTab: false,
  },
  conversation: {
    instancing: "multi",
    enabled: true,
    comingSoon: false,
    showInLauncher: true,
    showInNewTab: true,
  },
  browser: {
    instancing: "multi",
    enabled: false,
    comingSoon: true,
    showInLauncher: true,
    showInNewTab: true,
  },
  review: {
    instancing: "single",
    enabled: false,
    comingSoon: true,
    showInLauncher: true,
    showInNewTab: true,
  },
  terminal: {
    instancing: "multi",
    enabled: false,
    comingSoon: true,
    showInLauncher: true,
    showInNewTab: true,
  },
};
