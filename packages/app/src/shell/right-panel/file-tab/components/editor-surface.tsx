import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { themeModel } from "../../../theme/theme-model";
import type { FileDocumentModel } from "../model/file-document-model";
import type { ConnectableEditorHandle } from "./editor-handle";

// The non-web (native) editor surface: a desktop-only placeholder. The right panel is desktop-only this
// round (compact/mobile is deferred), and the real editor is a CodeMirror DOM view (editor-surface.web.tsx)
// that Metro resolves on web. Native never mounts an editor — it just states the feature is desktop-only,
// keeping the same props so the file-tab view is platform-agnostic.

export const EditorSurface = observer(function EditorSurface(_props: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  frozen: boolean;
  // Kept for prop parity with the web surface (which reports the caret to the status bar); native has no
  // editor, so this is never called.
  onCursor: (pos: { line: number; col: number }) => void;
}) {
  const tk = themeModel.tokens;
  const textStyle = useMemo(
    () => [styles.text, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.root}>
      <Text style={textStyle}>文件编辑仅桌面可用</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", padding: 20 },
  text: { fontSize: 13 },
});
