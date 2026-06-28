import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CARD_RADIUS, WEB_CARD_SHADOW, WEB_FROSTED } from "@/styles/card-surface";

export type RegionFrameKind = "left" | "main" | "right" | "fileTree";

// One floating card in the home shell. Pure presentation: the CodePilot macOS
// floating-card chrome — 14px radius, NO hard grey border, a three-layer diffuse
// drop shadow that lifts the card off the vibrancy backdrop, and a 1px inset white
// highlight ring as the card's only visible edge. This mirrors CodePilot
// globals.css "Round 33", which deleted the 1px outer/grey ring precisely because
// adjacent bordered cards read as hard divider lines in the gutters. The left card
// is translucent frosted (window vibrancy shows through); content cards are solid.
// Width is owned by the shell store for side regions; the center card flex-fills.
interface RegionFrameProps {
  kind: RegionFrameKind;
  width?: number;
  // Center frame as a chrome-less, transparent gutter-host: render children full-bleed while
  // keeping this node's element type and tree position identical to the chromed card. Used both
  // pre-connection (splash / onboarding fill it edge to edge) and on the workspace route (the
  // SplitContainer brings its own per-pane cards, which float on the periwinkle backdrop with
  // real gutters between them). That node stability is what lets the route navigator mounted
  // inside it survive the chrome ↔ bare flips without remounting. Only meaningful for kind="main".
  bare?: boolean;
  children: ReactNode;
}

export function RegionFrame({ kind, width, bare = false, children }: RegionFrameProps) {
  styles.useVariants({ kind });
  const frameStyle = useMemo(
    () =>
      bare
        ? styles.bare
        : [
            styles.card,
            kind === "main" ? null : { width },
            WEB_CARD_SHADOW,
            kind === "left" ? WEB_FROSTED : null,
          ],
    [bare, kind, width],
  );
  return <View style={frameStyle}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    height: "100%",
    // CodePilot's floating-card radius, shared with the workspace split panes via card-surface.
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    flexDirection: "column",
    // Native fallback lift only — on web WEB_CARD_SHADOW overrides the box-shadow.
    // No borderWidth/borderColor: the card edge is the inset highlight ring (web),
    // never a grey 1px line (that was the "double divider" between cards).
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
  // Full-bleed center passthrough (pre-connection splash / onboarding): no card radius, shadow
  // or surface — the window's own background shows through and the route fills it edge to edge.
  bare: {
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
}));
