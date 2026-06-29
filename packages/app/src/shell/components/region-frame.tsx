import { observer } from "mobx-react-lite";
import { type ReactNode, useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { CARD_RADIUS, WEB_CARD_SHADOW } from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";

// One floating card in the shell. Pure presentation: an OPAQUE solid surface with the shell's
// card radius + soft lift, no hard gray border (the edge is the inset highlight ring so adjacent
// cards don't read as a double divider in the gutters). The cards are deliberately NOT frosted:
// they sit solid over the translucent light-blue window backdrop (the desktop shows through the
// BACKDROP, never through the cards). The sidebar takes its own pale rail surface, main flex-fills,
// content cards take an explicit width owned by the model. `observer` so a scheme flip repaints
// the surface color.

export type RegionFrameKind = "sidebar" | "main" | "content";

// Web-only CSS escape (boxShadow) cast once to the RN style type. No backdrop-filter: the cards
// are solid, not frosted.
const WEB_CARD = WEB_CARD_SHADOW as ViewStyle | null;

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
