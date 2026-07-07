import { observer } from "mobx-react-lite";
import { useCallback, useEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  useContextMenu,
} from "@/components/ui/context-menu";
import { newEntryParentDir } from "../model/context-menu-items";
import type { FileTreeStore } from "../model/file-tree-store";
import type { ContextMenuItem as MenuItem } from "../model/types";

// The three right-click menus (sFT8), rendered by reusing the shared design-system context-menu
// primitive (standards §4.A — no new floating layer). Pure view — it feeds the primitive the items
// derived live by store.deriveMenu and dispatches the matching store action on select. Positioning
// (open at the click point, top-right aligned, expand down+left, flip up at the bottom boundary) is the
// primitive's own auto-flip: side="bottom" align="end" anchors the menu's top-right to the point and
// flips to top when the bottom edge is short — exactly the "左下默认 / 边界翻转左上" requirement.

// The target a right-click acts on, mirrored from the store's contextMenu state.
interface Target {
  kind: "blank" | "dir" | "file";
  path?: string;
}

// Dispatch a selected menu item to the store action it maps to. Blank-target items that need a path
// (paste / find-in-files) operate on the root (".") — the store's root-relative space. Where a new
// entry lands is the model's decision (newEntryParentDir), not composed here.
function dispatchItem(store: FileTreeStore, item: MenuItem, target: Target): void {
  const path = target.path ?? ".";
  const parentForNew = newEntryParentDir(target);
  switch (item.id) {
    case "new-file":
      store.beginNew("new-file", parentForNew);
      return;
    case "new-folder":
      store.beginNew("new-folder", parentForNew);
      return;
    case "paste":
      void store.paste(path);
      return;
    case "cut":
      store.cut(path);
      return;
    case "copy":
      store.copy(path);
      return;
    case "rename":
      store.beginRename(path);
      return;
    case "add-to-chat":
      store.addToChat(path, target.kind === "dir" ? "directory" : "file");
      return;
    case "find-in-files":
      store.findInFiles(path);
      return;
    case "reveal-in-finder":
      store.revealInFinder(path);
      return;
    case "copy-path":
      store.copyPath(path, false);
      return;
    case "copy-relative-path":
      store.copyPath(path, true);
      return;
    case "delete":
      // Destructive: requestDelete confirms first (model-driven), then deletes only on accept.
      void store.requestDelete(path);
      return;
  }
}

export const TreeContextMenu = observer(function TreeContextMenu({
  store,
}: {
  store: FileTreeStore;
}) {
  const menu = store.contextMenu;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        store.closeContextMenu();
      }
    },
    [store],
  );
  return (
    <ContextMenu open={menu !== null} onOpenChange={onOpenChange}>
      {menu !== null ? <MenuBody store={store} target={menu.target} anchor={menu.anchor} /> : null}
    </ContextMenu>
  );
});

// The open menu's body: pushes the store anchor into the primitive (so it positions at the click point
// rather than measuring a trigger) and renders the derived items. The primitive groups + scrolls them.
// observer: deriveMenu reads observable state (clipboard → paste enablement), so a clipboard change
// while the menu is open must re-render the rows (review 2026-07-07).
const MenuBody = observer(function MenuBody({
  store,
  target,
  anchor,
}: {
  store: FileTreeStore;
  target: Target;
  anchor: { x: number; y: number };
}) {
  const { setAnchorRect } = useContextMenu();
  useEffect(() => {
    setAnchorRect({ x: anchor.x, y: anchor.y, width: 0, height: 0 });
  }, [anchor.x, anchor.y, setAnchorRect]);

  const items = store.deriveMenu(target);
  return (
    <ContextMenuContent side="bottom" align="end" minWidth={180} testID="file-tree-context-menu">
      {items.map((item) => (
        <MenuRow key={item.id} store={store} item={item} target={target} />
      ))}
    </ContextMenuContent>
  );
});

// One menu row, owning its stable select handler so the item callback is not recreated inline (perf
// lint) and the dispatch closes over this row's item/target.
function MenuRow({
  store,
  item,
  target,
}: {
  store: FileTreeStore;
  item: MenuItem;
  target: Target;
}) {
  const onSelect = useCallback(() => dispatchItem(store, item, target), [store, item, target]);
  return (
    <ContextMenuItem
      disabled={!item.enabled}
      onSelect={onSelect}
      testID={`file-tree-menu-${item.id}`}
    >
      {item.label}
    </ContextMenuItem>
  );
}
