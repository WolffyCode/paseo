import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export interface RetainedPanelSurfaceProps {
  active: boolean;
  animated?: boolean;
  preservePaint?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function RetainedPanelSurface({
  active,
  children,
  style,
  testID,
}: RetainedPanelSurfaceProps) {
  return (
    <View
      collapsable={false}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[styles.root, style, !active && styles.hidden]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, hidden: { display: "none" } });
