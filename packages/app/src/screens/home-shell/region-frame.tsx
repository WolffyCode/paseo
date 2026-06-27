import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";

export type RegionFrameKind = "left" | "main" | "right" | "fileTree";

// One floating card in the home shell. Pure presentation: the GitHub-flat card
// chrome (1px border, 12px radius, light shadow) plus the per-region surface. The
// left card is translucent frosted (window vibrancy); the content cards are solid.
// Width is owned by the shell store for side regions; the center card flex-fills.
interface RegionFrameProps {
  kind: RegionFrameKind;
  width?: number;
  children: ReactNode;
}

// backdrop-filter is a web-only CSS property (no native equivalent); the frosted
// left card degrades to its solid translucent color on native.
const WEB_FROSTED = isWeb
  ? ({
      backdropFilter: "blur(22px) saturate(1.4)",
      WebkitBackdropFilter: "blur(22px) saturate(1.4)",
    } as object)
  : null;

export function RegionFrame({ kind, width, children }: RegionFrameProps) {
  styles.useVariants({ kind });
  const frameStyle = useMemo(
    () => [styles.card, kind === "main" ? null : { width }, kind === "left" ? WEB_FROSTED : null],
    [kind, width],
  );
  return <View style={frameStyle}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    height: "100%",
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    overflow: "hidden",
    flexDirection: "column",
    ...theme.shadow.sm,
    variants: {
      kind: {
        main: { flex: 1, minWidth: 0, backgroundColor: theme.colors.surfaceWorkspace },
        left: { backgroundColor: theme.colors.sidebarTranslucent },
        right: { backgroundColor: theme.colors.surfaceWorkspace },
        fileTree: { backgroundColor: theme.colors.surfaceWorkspace },
      },
    },
  },
}));
