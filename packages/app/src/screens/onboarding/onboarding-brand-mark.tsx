import type { ComponentType } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { codePilotLight } from "@/styles/codepilot-theme";

interface OnboardingBrandMarkProps {
  icon: ComponentType<{ color: string; size: number }>;
  size?: 60 | 48;
}

// The blue rounded brand tile with a white glyph that fronts the welcome / picker cards —
// codePilot's single filled-blue surface, carrying Helm's gauge (or the picker's network) mark.
export function OnboardingBrandMark({ icon: Icon, size = 60 }: OnboardingBrandMarkProps) {
  const isLarge = size === 60;
  return (
    <View style={isLarge ? styles.mark60 : styles.mark48}>
      <Icon color={codePilotLight.onPrimary} size={isLarge ? 30 : 24} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark60: {
    width: 60,
    height: 60,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: codePilotLight.primary,
    boxShadow: "0 4px 12px -3px rgba(9,105,218,0.5)",
  },
  mark48: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: codePilotLight.primary,
    boxShadow: "0 4px 12px -3px rgba(9,105,218,0.5)",
  },
});
