// The content-area right-click menu, derived live by content surface (mirroring file-tree's
// deriveContextMenuItems: static ordered id table → label + enabled). Three sets keyed to how the
// content renders: code/text editor (9 items), markdown preview (5), image (4); markdown-in-edit is a
// text editor so it reuses the editor set. Directory-tree write ops (new/rename/delete/file
// cut-copy-paste) are deliberately in NO set — the file tab never redraws the tree. Items are always
// enabled: the panel is desktop-only, so reveal-in-finder has no capability gate this round.

import type { DocumentKind } from "./document-kind";

export type ContentMenuItemId =
  | "cut"
  | "copy"
  | "paste"
  | "select-all"
  | "find"
  | "replace"
  | "copy-selection"
  | "copy-image"
  | "switch-to-edit"
  | "copy-file-path"
  | "locate-in-tree"
  | "reveal-in-finder";

export interface ContentMenuItem {
  id: ContentMenuItemId;
  label: string;
  enabled: boolean;
}

// Ordered id list per surface, copied from requirement item 25 (三套按内容区).
const EDITOR_MENU: ReadonlyArray<ContentMenuItemId> = [
  "cut",
  "copy",
  "paste",
  "select-all",
  "find",
  "replace",
  "copy-file-path",
  "locate-in-tree",
  "reveal-in-finder",
];
const MARKDOWN_PREVIEW_MENU: ReadonlyArray<ContentMenuItemId> = [
  "copy-selection",
  "copy-file-path",
  "locate-in-tree",
  "reveal-in-finder",
  "switch-to-edit",
];
const IMAGE_MENU: ReadonlyArray<ContentMenuItemId> = [
  "copy-image",
  "copy-file-path",
  "locate-in-tree",
  "reveal-in-finder",
];

const LABELS: Record<ContentMenuItemId, string> = {
  cut: "剪切",
  copy: "复制",
  paste: "粘贴",
  "select-all": "全选",
  find: "查找",
  replace: "替换",
  "copy-selection": "复制选中文本",
  "copy-image": "复制图片",
  "switch-to-edit": "切到编辑",
  "copy-file-path": "复制文件路径",
  "locate-in-tree": "在目录树中定位",
  "reveal-in-finder": "在 Finder 中显示",
};

// Derive the ordered content menu for a file tab's current surface. `mdView` only matters for markdown
// (preview → the 5-item read menu; edit → the 9-item editor menu). Binary/unrecognized read-only has no
// content menu (three sets only). Live selector — nothing is stored.
export function deriveContentMenu(input: {
  kind: DocumentKind;
  mdView: "preview" | "edit";
}): ContentMenuItem[] {
  return selectMenuIds(input).map((id) => ({ id, label: LABELS[id], enabled: true }));
}

// Pick the surface's ordered id list.
function selectMenuIds(input: {
  kind: DocumentKind;
  mdView: "preview" | "edit";
}): ReadonlyArray<ContentMenuItemId> {
  switch (input.kind) {
    case "image":
      return IMAGE_MENU;
    case "binary":
      return [];
    case "markdown":
      return input.mdView === "preview" ? MARKDOWN_PREVIEW_MENU : EDITOR_MENU;
    case "code":
    case "text":
      return EDITOR_MENU;
  }
}
