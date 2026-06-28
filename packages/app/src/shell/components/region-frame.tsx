import { observer } from "mobx-react-lite";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { CARD_RADIUS, WEB_CARD_SHADOW, WEB_FROSTED } from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";

// One floating card in the shell. Pure presentation: a translucent-white surface with the
// shell's card radius + soft lift, no hard gray border (the edge is the inset highlight
// ring so adjacent cards don't read as a double divider in the gutters). The sidebar surface
// is the frosted rail; main flex-fills; content cards take an explicit width owned by the
// model. `observer` so a scheme flip repaints the surface color.

export type RegionFrameKind = "sidebar" | "main" | "content";

// Web-only CSS escapes (boxShadow / backdropFilter) cast once to the RN style type.
const WEB_CARD = WEB_CARD_SHADOW as ViewStyle | null;
const WEB_RAIL = WEB_FROSTED as ViewStyle | null;

export const RegionFrame = observer(function RegionFrame({
  kind,
  width,
  children,
}: {
  kind: RegionFrameKind;
  width?: number;
  children: ReactNode;
}) {
  const tk = themeModel.tokens;
  const surface = kind === "sidebar" ? tk.surfaceSidebar : tk.surfaceCard;
  const cardStyle = useMemo(
    () => [
      styles.card,
      kind === "main" ? styles.main : null,
      kind === "main" || width == null ? null : { width },
      { backgroundColor: surface },
      WEB_CARD,
      kind === "sidebar" ? WEB_RAIL : null,
    ],
    [kind, width, surface],
  );
  return (
    <View testID="region-frame" style={cardStyle}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { height: "100%", borderRadius: CARD_RADIUS, overflow: "hidden", flexDirection: "column" },
  main: { flex: 1, minWidth: 0 },
});
