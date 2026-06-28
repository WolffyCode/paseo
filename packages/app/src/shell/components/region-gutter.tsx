import { observer } from "mobx-react-lite";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  type PointerEvent as RNPointerEvent,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { isWeb } from "@/constants/platform";
import { shellModel } from "../model/shell-model";
import { resolveRegionWidthFromDrag, type ShellRegion } from "../selectors/regions";
import { GUTTER_WIDTH } from "../theme/shell-tokens";
import { themeModel } from "../theme/theme-model";

// web-only CSS — the shell is desktop and dragging is a pointer gesture (cursor/touchAction
// are web escapes not in the RN ViewStyle typings).
const WEB_RESIZE_CURSOR = isWeb ? ({ cursor: "col-resize", touchAction: "none" } as object) : null;
const DOUBLE_CLICK_MS = 300;

// The 8px resize handle between two cards. It drags one side region's width in px and
// commits it through the model (clamp + per-workspace persistence live in the model); a
// double-click resets the region to its default. The center 3px line is faint at rest,
// stronger on hover, strongest while dragging. The drag start anchor is an ephemeral ref the
// model never reads — it lives here, not in the model. `observer` so a scheme flip repaints
// the line color.

interface RegionGutterProps {
  region: ShellRegion;
  // The left rail's width is global, so its gutter needs no workspaceKey. The two workspace
  // tools (right + fileTree) pass their workspace so the drag persists per workspace.
  workspaceKey?: string;
  currentWidth: number;
}

export const RegionGutter = observer(function RegionGutter({
  region,
  workspaceKey,
  currentWidth,
}: RegionGutterProps) {
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
        shellModel.setLeftWidth(next);
      } else if (workspaceKey != null) {
        shellModel.setRegionWidth(workspaceKey, region, next);
      }
    },
    [region, workspaceKey],
  );

  const onPointerDown = useCallback(
    (event: RNPointerEvent) => {
      if (!isWeb) {
        return;
      }
      const now = Date.now();
      if (now - lastDownAt.current < DOUBLE_CLICK_MS) {
        lastDownAt.current = 0;
        shellModel.resetRegionWidth(region, workspaceKey);
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
    [commitWidth, currentWidth, region, sign, workspaceKey],
  );

  const tk = themeModel.tokens;
  const state = lineState(hovered, dragging);
  const areaStyle = useMemo(() => [styles.area, WEB_RESIZE_CURSOR as ViewStyle | null], []);
  const lineStyle = useMemo(() => {
    const colorByState = { idle: tk.gutterIdle, hover: tk.gutterHover, drag: tk.gutterDrag };
    return [
      styles.line,
      { height: state === "idle" ? 40 : 120, backgroundColor: colorByState[state] },
    ];
  }, [state, tk]);
  return (
    <View
      style={areaStyle}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      testID="region-gutter"
    >
      <View style={lineStyle} />
    </View>
  );
});

// Drag wins over hover so the line stays lit even if the pointer drifts off the 8px track;
// hover is web-only.
function lineState(hovered: boolean, dragging: boolean): "idle" | "hover" | "drag" {
  if (dragging) {
    return "drag";
  }
  if (isWeb && hovered) {
    return "hover";
  }
  return "idle";
}

const styles = StyleSheet.create({
  area: {
    width: GUTTER_WIDTH,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  line: { width: 3, borderRadius: 3 },
});
