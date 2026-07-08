import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { themeModel } from "../../../theme/theme-model";
import { IconLock } from "../../components/icons";
import type { FileDocumentModel } from "../model/file-document-model";

// The read-only image preview (ui.html sRS5) — a thin <Image> over the data URI the model decoded on
// load, centered on the sidebar surface with the file name + a "read-only" chip. Pure presentation over
// the model: images have no editor buffer and no edit affordance, so there is nothing to dispatch here.
// Desktop/web only; react-native-web renders <Image source={{ uri: data-uri }}> as an <img>.

export const ImagePreview = observer(function ImagePreview({ doc }: { doc: FileDocumentModel }) {
  const tk = themeModel.tokens;
  const uri = doc.imageDataUri;
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  const s = useMemo(
    () => ({
      body: [styles.body, { backgroundColor: tk.surfaceSidebar }],
      frame: [styles.frame, { borderColor: tk.border, backgroundColor: tk.surfaceCard }],
      meta: [styles.meta, { color: tk.foregroundMuted }],
      badge: [styles.badge, { backgroundColor: tk.toggleActive }],
      badgeText: [styles.badgeText, { color: tk.foregroundMuted }],
    }),
    [tk],
  );
  return (
    <View style={s.body}>
      <View style={s.frame}>
        {source ? <Image source={source} style={styles.image} resizeMode="contain" /> : null}
      </View>
      <Text style={s.meta}>{doc.title}</Text>
      <View style={s.badge}>
        <IconLock size={12} color={tk.foregroundMuted} />
        <Text style={s.badgeText}>只读</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 18,
  },
  frame: {
    maxWidth: "100%",
    maxHeight: "70%",
    minWidth: 160,
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: 260, height: 190, maxWidth: "100%" },
  meta: { fontFamily: "SFMono-Regular", fontSize: 11.5 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11 },
});
