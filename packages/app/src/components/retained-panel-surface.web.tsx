import { useMemo, type CSSProperties } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { RetainedPanelSurfaceProps } from "./retained-panel-surface";

export function RetainedPanelSurface({
  active,
  animated,
  preservePaint = false,
  children,
  style,
  testID,
}: RetainedPanelSurfaceProps) {
  const reducedMotion = useReducedMotion();
  let transition = active
    ? "opacity 140ms ease, visibility 0s"
    : "opacity 140ms ease, visibility 0s 140ms";
  if (!animated || reducedMotion) transition = "none";
  const surface = useMemo<CSSProperties>(
    () =>
      !active && preservePaint
        ? {
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            opacity: 1,
            visibility: "visible",
            pointerEvents: "none",
            zIndex: 0,
          }
        : {
            display: animated || active ? "flex" : "none",
            flex: 1,
            flexDirection: "column",
            minHeight: 0,
            minWidth: 0,
            position: active ? "relative" : "absolute",
            inset: active ? undefined : 0,
            opacity: active ? 1 : 0,
            visibility: active ? "visible" : "hidden",
            pointerEvents: active ? "auto" : "none",
            zIndex: active ? 1 : 0,
            transition,
          },
    [active, animated, preservePaint, transition],
  );
  return (
    <div style={surface} aria-hidden={!active} inert={!active}>
      <View collapsable={false} style={[styles.root, style]} testID={testID}>
        {children}
      </View>
    </div>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, minHeight: 0, minWidth: 0 } });
