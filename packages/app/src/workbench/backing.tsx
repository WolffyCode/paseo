import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ReactNode } from "react";

export function WorkbenchBacking({ children }: { active: boolean; children: ReactNode }) {
  return <View style={styles.root}>{children}</View>;
}
const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
}));
