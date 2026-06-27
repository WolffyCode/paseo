import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { codePilotLight } from "@/styles/codepilot-theme";

interface OnboardingCardProps {
  children: ReactNode;
}

// The centred codePilot welcome card — white surface, 1px border, soft floating shadow —
// that every onboarding stage renders its content into.
export function OnboardingCard({ children }: OnboardingCardProps) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    width: "100%",
    maxWidth: 434,
    alignItems: "center",
    gap: theme.spacing[4],
    paddingTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[8],
    paddingBottom: theme.spacing[6],
    backgroundColor: codePilotLight.surface,
    borderWidth: 1,
    borderColor: codePilotLight.border,
    borderRadius: theme.borderRadius.xl,
    boxShadow: "0 10px 30px -14px rgba(31,35,40,0.22), 0 1px 3px rgba(31,35,40,0.08)",
  },
}));
