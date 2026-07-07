// Right-click menu selector, pure (standards §8.6 / sFT8). Given the right-click target plus the
// clipboard/platform/draft/write-capability flags, it derives the ordered, "visible + enabled" item
// list for each of the three menus (blank / dir / file). Item ordering mirrors ui.html sFT8; the view
// inserts separators. Visibility and enabling are decided here so components carry zero menu logic.

import type { ContextMenuItem } from "./types";

type ItemId = ContextMenuItem["id"];
type TargetKind = "blank" | "dir" | "file";

// Ordered item id list per menu, copied from ui.html sFT8 (A blank / B dir / C file).
const MENU_ITEMS: Record<TargetKind, ReadonlyArray<ItemId>> = {
  blank: [
    "new-file",
    "new-folder",
    "paste",
    "reveal-in-finder",
    "find-in-files",
    "copy-path",
    "copy-relative-path",
  ],
  dir: [
    "new-file",
    "new-folder",
    "paste",
    "cut",
    "copy",
    "rename",
    "reveal-in-finder",
    "copy-path",
    "copy-relative-path",
    "add-to-chat",
    "delete",
  ],
  file: [
    "new-file",
    "cut",
    "copy",
    "rename",
    "reveal-in-finder",
    "find-in-files",
    "copy-path",
    "copy-relative-path",
    "add-to-chat",
    "delete",
  ],
};

const LABELS: Record<ItemId, string> = {
  "new-file": "新建文件",
  "new-folder": "新建文件夹",
  paste: "粘贴",
  cut: "剪切",
  copy: "复制",
  rename: "重命名",
  "add-to-chat": "将文件添加到聊天",
  "find-in-files": "在文件中查找",
  "reveal-in-finder": "在 Finder 中显示",
  "copy-path": "复制路径",
  "copy-relative-path": "复制相对路径",
  delete: "删除",
};

// Items that mutate the filesystem; all gated behind the fsWrite capability (delete is a structure write
// like the rest, so it shares the gate).
const WRITE_ITEMS: ReadonlySet<ItemId> = new Set([
  "new-file",
  "new-folder",
  "paste",
  "cut",
  "copy",
  "rename",
  "delete",
]);

// Items whose action is irreversible; the view confirms before dispatching. Only delete this round.
const DESTRUCTIVE_ITEMS: ReadonlySet<ItemId> = new Set(["delete"]);

/** Derive the ordered context-menu items (with per-item enabled flag) for a right-click target. */
export function deriveContextMenuItems(input: {
  target: { kind: TargetKind; path?: string };
  hasClipboard: boolean;
  isElectron: boolean;
  hasActiveDraft: boolean;
  fsWriteAvailable: boolean;
}): ContextMenuItem[] {
  return MENU_ITEMS[input.target.kind].map((id) => ({
    id,
    label: LABELS[id],
    enabled: isItemEnabled(id, input),
    destructive: DESTRUCTIVE_ITEMS.has(id),
  }));
}

// Per-item enable rule: write items need fsWrite, then layer on item-specific gates
// (paste→clipboard, reveal→Electron, add-to-chat→active draft). Read items are always enabled.
function isItemEnabled(
  id: ItemId,
  input: {
    hasClipboard: boolean;
    isElectron: boolean;
    hasActiveDraft: boolean;
    fsWriteAvailable: boolean;
  },
): boolean {
  if (WRITE_ITEMS.has(id) && !input.fsWriteAvailable) {
    return false;
  }
  if (id === "paste") {
    return input.hasClipboard;
  }
  if (id === "reveal-in-finder") {
    return input.isElectron;
  }
  if (id === "add-to-chat") {
    return input.hasActiveDraft;
  }
  return true;
}

// Where "new file / new folder" lands for a right-click target (sFT8 各项行为): a directory (or the
// blank area = the root ".") hosts the new entry itself; a FILE target redirects to its parent
// directory — you can't create inside a file. Root-relative space throughout; entries directly
// under the root collapse to ".". Extracted here (not composed in the menu component) so the
// landing rule is a tested model decision.
export function newEntryParentDir(target: {
  kind: "blank" | "dir" | "file";
  path?: string;
}): string {
  const path = target.path ?? ".";
  if (target.kind !== "file") {
    return path;
  }
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? "." : path.slice(0, index);
}
