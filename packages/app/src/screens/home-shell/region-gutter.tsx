import { useCallback, useMemo, useRef, useState } from "react";
import { View, type PointerEvent as RNPointerEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useShellLayoutStore } from "@/stores/shell-layout-store";
import { resolveRegionWidthFromDrag, type ShellRegion } from "@/stores/shell-regions";

// cursor + touchAction are web CSS properties, not RN ViewStyle — applied as a cast
// on web only (the shell is desktop, drag is web).
const WEB_RESIZE_CURSOR = isWeb ? ({ cursor: "col-resize", touchAction: "none" } as object) : null;

// Resolve the resize line's visual state. Like CodePilot's ResizeGutter the line is
// invisible at rest (a clean transparent seam between the floating cards, so the
// vibrancy reads through), and only surfaces on hover or while dragging. Drag wins
// over hover so the line stays lit even if the pointer drifts off the 8px track.
function lineState(hovered: boolean, dragging: boolean): "idle" | "hover" | "drag" {
  if (dragging) {
    return "drag";
  }
  if (isWeb && hovered) {
    return "hover";
  }
  return "idle";
}

// The 8px resize handle between two cards. Drags one side region's width in px and
// persists it via shell-layout-store (the px clamp lives in resolveRegionWidthFromDrag,
// a sibling of the existing normalized split handle — different contract on purpose).
// Pointer dragging is web-only since the shell is desktop. The 2px center line follows
// CodePilot: hidden at rest, faint on hover, strong while dragging.
interface RegionGutterProps {
  region: ShellRegion;
  // The left rail's width is global, so its gutter needs no workspaceKey. The two
  // workspace tools (right + fileTree) pass their workspace so the drag persists
  // per workspace.
  workspaceKey?: string;
  currentWidth: number;
}

export function RegionGutter({ region, workspaceKey, currentWidth }: RegionGutterProps) {
  const setLeftWidth = useShellLayoutStore((state) => state.setLeftWidth);
  const setRegionWidth = useShellLayoutStore((state) => state.setRegionWidth);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragStart = useRef({ x: 0, width: currentWidth });
  // The left card grows as the gutter moves right; right + fileTree grow as it moves
  // left, so their delta is mirrored.
  const sign = region === "left" ? 1 : -1;

  // Hover tracking sits on the plain area View (no inner Pressable), per docs/hover.md:
  // the gutter only styles its own line, so onPointerEnter/Leave is the canonical form.
  const handlePointerEnter = useCallback(() => setHovered(true), []);
  const handlePointerLeave = useCallback(() => setHovered(false), []);

  const handlePointerDown = useCallback(
    (event: RNPointerEvent) => {
      if (!isWeb) {
        return;
      }
      const handle = event.currentTarget as unknown as HTMLElement | null;
      dragStart.current = { x: event.nativeEvent.clientX, width: currentWidth };
      setDragging(true);
      handle?.setPointerCapture?.(event.nativeEvent.pointerId);
      document.body.style.cursor = "col-resize";

      const onMove = (moveEvent: PointerEvent) => {
        const deltaPx = (moveEvent.clientX - dragStart.current.x) * sign;
        const next = resolveRegionWidthFromDrag({
          region,
          startWidth: dragStart.current.width,
          deltaPx,
        });
        // The left rail persists to the single global width; the two workspace
        // tools persist their width per workspace.
        if (region === "left") {
          setLeftWidth(next);
        } else if (workspaceKey != null) {
          setRegionWidth(workspaceKey, region, next);
        }
      };
      const onUp = () => {
        setDragging(false);
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [currentWidth, region, sign, setLeftWidth, setRegionWidth, workspaceKey],
  );

  styles.useVariants({ state: lineState(hovered, dragging) });
  const areaStyle = useMemo(() => [styles.area, WEB_RESIZE_CURSOR], []);
  return (
    <View
      style={areaStyle}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  area: {
    width: 8,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    width: 2,
    borderRadius: theme.borderRadius.sm,
    variants: {
      state: {
        // Invisible at rest — the seam stays a clean transparent gutter.
        idle: { opacity: 0, height: 40, backgroundColor: theme.colors.border },
        hover: { opacity: 1, height: 64, backgroundColor: theme.colors.border },
        drag: { opacity: 1, height: 120, backgroundColor: theme.colors.foregroundMuted },
      },
    },
  },
}));
