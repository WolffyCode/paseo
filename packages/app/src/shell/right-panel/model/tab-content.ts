// The single seam between the multi-tab framework and any concrete tab type. The framework knows only
// this contract; `file` is the first implementer, and future terminal/browser/review/conversation each
// plug in one implementation. Kept as pure types (zero runtime) so the framework never imports a
// concrete tab class — content is built through an injected TabContentFactory instead.

import type { FileLocation } from "./file-location";

// The activity dot a tab head may show. This round the only driver is a file's dirty state; a tab with
// no content-driven activity is "none".
export type ActivityDot = "none" | "dirty";

// What every tab content exposes to the framework. title/activityDot are read live off the content at
// render time (never mirrored into framework storage — one truth source). The hooks let content consume
// a path-deduped open retarget, react to focus, and close without the framework knowing type-specific work.
export interface TabContent {
  readonly title: string;
  readonly activityDot: ActivityDot;
  retarget(location: FileLocation): void;
  onActivated(): void;
  onClosing(): void;
}

// The five tab types the framework declares. Only `file` is openable this round; the other four are
// disabled data rows in TAB_KIND_POLICY, not abstractions.
export type TabKind = "file" | "conversation" | "browser" | "review" | "terminal";

// The request to open a tab. This round's only shape is `file` (kind is the discriminant); when a
// second kind lands this becomes a `kind`-tagged union. The framework hands this to the factory, so it
// stays agnostic of how each kind is constructed.
export interface OpenTabRequest {
  kind: "file";
  location: FileLocation;
}

// The construction seam: the framework builds tab content through this port instead of importing the
// concrete class. `file` → FileDocumentModel is the sole registration this round.
export interface TabContentFactory {
  create(request: OpenTabRequest): TabContent;
}
