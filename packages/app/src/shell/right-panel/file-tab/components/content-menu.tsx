import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { useWebDomClick } from "../../../file-tree/components/use-web-dom-click";
import { themeModel } from "../../../theme/theme-model";
import { joinHostPath } from "../../model/file-location";
import {
  copyImageDataUri,
  copyTextToClipboard,
  execEditorCommand,
  revealInFinder,
} from "../data/content-actions";
import {
  type ContentMenuItem,
  type ContentMenuItemId,
  deriveContentMenu,
} from "../model/content-menu-items";
import type { FileDocumentModel } from "../model/file-document-model";

// The content-area right-click menu (ui.html sRS4/sRS5) — three item sets derived live by content surface
// (code/text 9, markdown preview 5, image 4). Rendered as an anchored floating card (the shared `.ctx`
// look), NOT the old app context-menu primitive. Pure view: it renders deriveContentMenu(doc) and
// dispatches each item to the doc intent / clipboard-finder-editor port. Outside-click + Esc close it
// (web listeners); each row fires through the raw DOM click hook (see use-web-dom-click, RN-web press
// drops rapid clicks). The menu open/anchor is UI-local state (the domain model has no menu position).

// Dispatch a chosen item to the intent it maps to. Editor ops go to the focused editor (execCommand),
// find/replace + locate + switch-to-edit to the doc, path/finder/image to the ports.
function dispatchItem(doc: FileDocumentModel, id: ContentMenuItemId): void {
  switch (id) {
    case "cut":
      return execEditorCommand("cut");
    case "copy":
    case "copy-selection":
      return execEditorCommand("copy");
    case "paste":
      return execEditorCommand("paste");
    case "select-all":
      return execEditorCommand("selectAll");
    case "find":
      return doc.openFind();
    case "replace":
      return doc.openReplace();
    case "switch-to-edit":
      return doc.toggleMdView();
    case "copy-file-path":
      return copyTextToClipboard(doc.path);
    case "copy-image":
      return copyImageDataUri(doc.imageDataUri ?? "");
    case "locate-in-tree":
      return doc.onActivated();
    case "reveal-in-finder":
      return revealInFinder(joinHostPath(doc.root, doc.path));
  }
}

export const ContentMenu = observer(function ContentMenu({
  doc,
  anchor,
  onClose,
}: {
  doc: FileDocumentModel;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const menuRef = useRef<View>(null);

  // Close on an outside mousedown or Escape (web). Mousedown (not click) so the menu is gone before a new
  // click lands elsewhere; a mousedown INSIDE the menu is ignored so a row's own click can still fire.
  useEffect(() => {
    if (!isWeb || !anchor) {
      return;
    }
    const node = menuRef.current as unknown as HTMLElement | null;
    const onDown = (event: MouseEvent): void => {
      if (!node || !node.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const tk = themeModel.tokens;
  const items = anchor ? deriveContentMenu({ kind: doc.kind, mdView: doc.mdView }) : [];
  const menuStyle = useMemo(
    () => [
      styles.menu,
      {
        left: anchor?.x ?? 0,
        top: anchor?.y ?? 0,
        backgroundColor: tk.surfaceCard,
        borderColor: tk.border,
      },
    ],
    [anchor?.x, anchor?.y, tk.surfaceCard, tk.border],
  );
  if (!anchor || items.length === 0) {
    return null;
  }
  return (
    <View ref={menuRef} style={menuStyle}>
      {items.map((item) => (
        <MenuRow key={item.id} doc={doc} item={item} onClose={onClose} />
      ))}
    </View>
  );
});

// One menu row: a raw-DOM-click Pressable that dispatches its item then closes the menu.
const MenuRow = observer(function MenuRow({
  doc,
  item,
  onClose,
}: {
  doc: FileDocumentModel;
  item: ContentMenuItem;
  onClose: () => void;
}) {
  const tk = themeModel.tokens;
  const onPress = useCallback(() => {
    dispatchItem(doc, item.id);
    onClose();
  }, [doc, item.id, onClose]);
  const hostRef = useWebDomClick({ onPress, disabled: !item.enabled });
  const style = useMemo(
    () => [styles.row, item.enabled ? null : styles.rowDisabled],
    [item.enabled],
  );
  const textStyle = useMemo(() => [styles.rowText, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable ref={hostRef} style={style} onPress={onPress} accessibilityRole="menuitem">
      <Text style={textStyle}>{item.label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    zIndex: 20,
    width: 224,
    borderWidth: 1,
    borderRadius: 10,
    padding: 5,
    // Shadow mirrors ui.html .ctx.
    shadowColor: "#1f2328",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 6,
    justifyContent: "center",
  },
  rowDisabled: { opacity: 0.5 },
  rowText: { fontSize: 13 },
});
