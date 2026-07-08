// WorkbenchModel — the tab framework's single truth source (class + MobX, mirroring ShellModel /
// FileTreeStore style). It owns the tab set + focus and the intent transitions; every derivation
// (dedup, drop-index landing, mode) is delegated to the pure functions in this directory. It is
// content-type-agnostic: a PanelTab holds IDENTITY ONLY and a reference to that tab's TabContent, and
// the framework builds content through an injected TabContentFactory — it never imports FileDocumentModel
// or any concrete tab class. title/activityDot are read live off content at render time, so there is one
// truth source for them (no mirrored copy on the tab).

import { makeAutoObservable, observable } from "mobx";
import type { FileLocation } from "./file-location";
import { normalizeFileLocation } from "./file-location";
import type { OpenTabRequest, TabContent, TabContentFactory, TabKind } from "./tab-content";
import { TAB_KIND_POLICY } from "./tab-kind-policy";
import { resolveTabInstancing } from "./tab-instancing";
import { placeTabAtDropIndex } from "./tab-order";

// A tab's stored shape: identity (id/kind/path) plus its content reference. Deliberately NO title or
// activityDot — those live on `content` and are read live, so the tab head can never disagree with the
// content's own state.
export interface PanelTab {
  readonly id: string;
  readonly kind: TabKind;
  readonly path: string;
  readonly content: TabContent;
}

export class WorkbenchModel {
  tabs: PanelTab[] = [];
  focusedTabId: string | null = null;

  private readonly factory: TabContentFactory;

  constructor(factory: TabContentFactory) {
    this.factory = factory;
    // autoBind so intent methods keep `this` when handed to view handlers. `factory` is injected
    // wiring, not reactive state. `tabs` is shallow-observable: the array's structure (push/replace) is
    // reactive, but the contained PanelTab/content are kept as plain references — the framework treats
    // content as an opaque contract and must not deep-proxy a domain object it doesn't own.
    makeAutoObservable<this, "factory">(
      this,
      { factory: false, tabs: observable.shallow },
      { autoBind: true },
    );
  }

  // launcher when empty, tabs otherwise. "Close all → launcher" is this derivation, not a special case.
  get mode(): "launcher" | "tabs" {
    return this.tabs.length === 0 ? "launcher" : "tabs";
  }

  // Open a tab for a request: dedup by identity (file = normalized path) and focus the existing tab, or
  // build content via the factory, append, and focus. The location is normalized here (the one canonical
  // point) so path identity and the content's initial target are consistent.
  openTab(request: OpenTabRequest): void {
    const location = normalizeFileLocation(request.location);
    const decision = resolveTabInstancing(
      this.tabs.map((tab) => ({ id: tab.id, kind: tab.kind, path: tab.path })),
      { kind: request.kind, path: location.path },
    );
    if (decision.action === "focus") {
      this.focusTab(decision.id);
      return;
    }
    const content = this.factory.create({ kind: request.kind, location });
    const tab: PanelTab = {
      id: `${request.kind}:${location.path}`,
      kind: request.kind,
      path: location.path,
      content,
    };
    this.tabs.push(tab);
    this.focusTab(tab.id);
  }

  // The launcher / new-tab entry. Only `file` is usable this round. With no location it opens an EMPTY
  // "choose a file" file tab (path "") so the tab strip appears (requirement item 3 / sRS2·4·7); the empty
  // path dedups to at most one such tab, and FileTabView renders its "选择一个文件" state off `!doc.path`.
  // A later file open appends/focuses its own path-identified tab.
  openLauncherType(kind: TabKind, location?: FileLocation): void {
    if (!TAB_KIND_POLICY[kind].enabled) {
      return;
    }
    if (kind === "file") {
      this.openTab({ kind: "file", location: location ?? { path: "" } });
    }
  }

  // Focus a tab: blur the previously focused tab (onClosing = its autosave hook) and activate the new one
  // (onActivated = tree reveal). Re-focusing the already-focused tab only re-activates it (no spurious
  // blur/autosave of a tab you never left).
  focusTab(id: string): void {
    const target = this.tabs.find((tab) => tab.id === id);
    if (!target) {
      return;
    }
    if (this.focusedTabId !== id) {
      this.tabs.find((tab) => tab.id === this.focusedTabId)?.content.onClosing();
      this.focusedTabId = id;
    }
    target.content.onActivated();
  }

  // Close one tab: run its content's onClosing (blur = autosave, non-blocking) then remove it. If it was
  // focused, focus shifts to the neighbor at the vacated slot (or null → launcher when it was the last).
  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) {
      return;
    }
    const wasFocused = this.focusedTabId === id;
    this.tabs[index].content.onClosing();
    this.tabs = this.tabs.filter((tab) => tab.id !== id);
    if (wasFocused) {
      this.focusNeighborAt(index);
    }
  }

  // Close every tab except the target: autosave+remove the rest, keep and focus the target.
  closeOthers(id: string): void {
    const keep = this.tabs.find((tab) => tab.id === id);
    if (!keep) {
      return;
    }
    for (const tab of this.tabs) {
      if (tab.id !== id) {
        tab.content.onClosing();
      }
    }
    this.tabs = [keep];
    this.focusedTabId = id;
    keep.content.onActivated();
  }

  // Close all tabs (autosaving each) → empty workbench → launcher (via the mode derivation).
  closeAll(): void {
    for (const tab of this.tabs) {
      tab.content.onClosing();
    }
    this.tabs = [];
    this.focusedTabId = null;
  }

  // Drag-reorder: land the moving tab at the drop index (pure landing rule); focus is unchanged.
  reorderTab(id: string, dropIndex: number): void {
    const byId = new Map(this.tabs.map((tab) => [tab.id, tab]));
    const order = placeTabAtDropIndex([...byId.keys()], id, dropIndex);
    this.tabs = order
      .map((tabId) => byId.get(tabId))
      .filter((tab): tab is PanelTab => tab !== undefined);
  }

  // After removing the focused tab at `index`, focus the tab that slid into that slot (clamped to the
  // new last), or null → launcher when none remain. The newly focused tab is activated (tree reveal).
  private focusNeighborAt(index: number): void {
    if (this.tabs.length === 0) {
      this.focusedTabId = null;
      return;
    }
    const next = this.tabs[Math.min(index, this.tabs.length - 1)];
    this.focusedTabId = next.id;
    next.content.onActivated();
  }
}
