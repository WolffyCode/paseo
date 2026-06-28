import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";

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
  // Pre-connection passthrough for the center frame: render children full-bleed with no card
  // chrome while keeping this node's element type and tree position identical to the chromed
  // card. That stability is what lets the route navigator mounted inside it survive the
  // chrome-disabled → chrome-enabled flip without remounting. Only meaningful for kind="main".
  bare?: boolean;
  children: ReactNode;
}

// CodePilot's two-layer card shadow flattened onto Helm's single overflow:hidden
// card. (overflow:hidden — unlike clip-path — does NOT crop an outer box-shadow, so
// one node is enough; CodePilot split frame/surface only to dodge clip-path cropping
// its own shadow.) Outer: three diffuse drops (rgba .06) for the lift. Inset: a 1px
// white highlight ring (rgba 255,255,255,.18) — the visible edge, NOT a grey border.
// Web-only; native falls back to the RN shadow object in `card`.
const WEB_CARD_SHADOW = isWeb
  ? ({
      boxShadow:
        "0 1px 1px -0.5px rgba(0,0,0,0.06), 0 3px 3px -1.5px rgba(0,0,0,0.06), 0 6px 6px -3px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.18)",
    } as object)
  : null;

// backdrop-filter is web-only CSS (no native equivalent); the frosted left card
// degrades to its solid translucent color on native. blur(28px) saturate(1.5)
// matches CodePilot's --platform-surface-sidebar treatment over window vibrancy.
const WEB_FROSTED = isWeb
  ? ({
      backdropFilter: "blur(28px) saturate(1.5)",
      WebkitBackdropFilter: "blur(28px) saturate(1.5)",
    } as object)
  : null;

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
    // 14px = CodePilot's floating-card radius (globals.css darwin profile). It sits
    // between token xl(12) and 2xl(16), so it's inlined as the card-specific value
    // rather than bent onto a general radius step.
    borderRadius: 14,
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
