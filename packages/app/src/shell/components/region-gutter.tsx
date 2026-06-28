import { useCallback, useMemo, useRef, useState } from "react";
import { View, type PointerEvent as RNPointerEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { useShellActions } from "../api/use-shell";
import { resolveRegionWidthFromDrag, type ShellRegion } from "../selectors/regions";
import { GUTTER_WIDTH, SHELL_COLORS } from "../theme/shell-tokens";

// web-only CSS — the shell is desktop and dragging is a pointer gesture.
const WEB_RESIZE_CURSOR = isWeb ? ({ cursor: "col-resize", touchAction: "none" } as object) : null;
const DOUBLE_CLICK_MS = 300;

// The 8px resize handle between two cards. It drags one side region's width in px and
// commits it through the facade (clamp + per-workspace persistence live in the model);
// a double-click resets the region to its default. The center 3px line is faint at rest,
// stronger on hover, strongest while dragging. The drag gesture's start anchor is an
// ephemeral ref the model never reads — it lives here, not in the store.

interface RegionGutterProps {
  region: ShellRegion;
  // The left rail's width is global, so its gutter needs no workspaceKey. The two
  // workspace tools (right + fileTree) pass their workspace so the drag persists per
  // workspace.
  workspaceKey?: string;
  currentWidth: number;
}

export function RegionGutter({ region, workspaceKey, currentWidth }: RegionGutterProps) {
  const { setLeftWidth, setRegionWidth, resetRegionWidth } = useShellActions();
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragStart = useRef({ x: 0, width: currentWidth });
  const lastDownAt = useRef(0);
  // Left grows as the gutter moves right; right + fileTree grow as it moves left.
  const sign = region === "left" ? 1 : -1;

  const onPointerEnter = useCallback(() => setHovered(true), []);
  const onPointerLeave = useCallback(() => setHovered(false), []);

  const commitWidth = useCallback(
    (next: number) => {
      if (region === "left") {
        setLeftWidth(next);
      } else if (workspaceKey != null) {
        setRegionWidth(workspaceKey, region, next);
      }
    },
    [region, workspaceKey, setLeftWidth, setRegionWidth],
  );

  const onPointerDown = useCallback(
    (event: RNPointerEvent) => {
      if (!isWeb) {
        return;
      }
      const now = Date.now();
      if (now - lastDownAt.current < DOUBLE_CLICK_MS) {
        lastDownAt.current = 0;
        resetRegionWidth(region, workspaceKey);
        return;
      }
      lastDownAt.current = now;

      const handle = event.currentTarget as unknown as HTMLElement | null;
      dragStart.current = { x: event.nativeEvent.clientX, width: currentWidth };
      setDragging(true);
      handle?.setPointerCapture?.(event.nativeEvent.pointerId);
      document.body.style.cursor = "col-resize";

      const onMove = (moveEvent: PointerEvent) => {
        const deltaPx = (moveEvent.clientX - dragStart.current.x) * sign;
        commitWidth(
          resolveRegionWidthFromDrag({ region, startWidth: dragStart.current.width, deltaPx }),
        );
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
    [commitWidth, currentWidth, region, resetRegionWidth, sign, workspaceKey],
  );

  styles.useVariants({ state: lineState(hovered, dragging) });
  const areaStyle = useMemo(() => [styles.area, WEB_RESIZE_CURSOR], []);
  return (
    <View
      style={areaStyle}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <View style={styles.line} />
    </View>
  );
}

// Drag wins over hover so the line stays lit even if the pointer drifts off the 8px
// track; hover is web-only.
function lineState(hovered: boolean, dragging: boolean): "idle" | "hover" | "drag" {
  if (dragging) {
    return "drag";
  }
  if (isWeb && hovered) {
    return "hover";
  }
  return "idle";
}

const styles = StyleSheet.create((theme) => ({
  area: {
    width: GUTTER_WIDTH,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    width: 3,
    borderRadius: 3,
    variants: {
      state: {
        idle: { height: 40, backgroundColor: SHELL_COLORS[theme.colorScheme].gutterIdle },
        hover: { height: 120, backgroundColor: SHELL_COLORS[theme.colorScheme].gutterHover },
        drag: { height: 120, backgroundColor: SHELL_COLORS[theme.colorScheme].gutterDrag },
      },
    },
  },
}));
