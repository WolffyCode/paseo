import { useMemo } from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { buildSettingsSectionRoute } from "@/utils/host-routes";
import { SettingsSidebar } from "@/screens/settings-codepilot/settings-sidebar";

// Settings entry. Desktop has the nav in the shell's left card, so the root redirects
// straight to the first section. Compact has no shell, so the root shows the nav list
// full-screen and each row drills into a section route.
export default function SettingsIndexRoute() {
  const isCompactLayout = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const screenStyle = useMemo(() => [indexStyles.screen, { paddingTop: insets.top }], [insets.top]);

  if (!isCompactLayout) {
    return <Redirect href={buildSettingsSectionRoute("general")} />;
  }

  return (
    <View style={screenStyle}>
      <SettingsSidebar />
    </View>
  );
}

const indexStyles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSidebar,
  },
}));
