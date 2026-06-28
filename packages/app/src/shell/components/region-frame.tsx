import { type ReactNode, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { CARD_RADIUS, SHELL_COLORS, WEB_CARD_SHADOW, WEB_FROSTED } from "../theme/shell-tokens";

// One floating card in the shell. Pure presentation: a translucent-white surface with the
// shell's card radius + soft lift, no hard gray border (the edge is the inset highlight
// ring so adjacent cards don't read as a double divider line in the gutters). The sidebar
// surface is the frosted rail; main flex-fills; content cards take an explicit width.
// Width is owned by the model — passed in here — and goes through the inline escape hatch
// so a drag doesn't grow the web CSS registry.

export type RegionFrameKind = "sidebar" | "main" | "content";

interface RegionFrameProps {
  kind: RegionFrameKind;
  width?: number;
  children: ReactNode;
}

export function RegionFrame({ kind, width, children }: RegionFrameProps) {
  styles.useVariants({ kind });
  const style = useMemo(
    () => [
      styles.card,
      kind === "main" || width == null ? null : inlineUnistylesStyle({ width }),
      WEB_CARD_SHADOW,
      kind === "sidebar" ? WEB_FROSTED : null,
    ],
    [kind, width],
  );
  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    height: "100%",
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    flexDirection: "column",
    variants: {
      kind: {
        main: {
          flex: 1,
          minWidth: 0,
          backgroundColor: SHELL_COLORS[theme.colorScheme].surfaceCard,
        },
        sidebar: { backgroundColor: SHELL_COLORS[theme.colorScheme].surfaceSidebar },
        content: { backgroundColor: SHELL_COLORS[theme.colorScheme].surfaceCard },
      },
    },
  },
}));
