import { useMemo, type CSSProperties } from "react";
import { StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { RetainedPanelSurfaceProps } from "./retained-panel-surface";

export function RetainedPanelSurface({
  active,
  animated,
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
    () => ({
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
    }),
    [active, animated, transition],
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
