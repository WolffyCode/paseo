// Per-platform settings frame. On desktop the home shell already owns the top bar +
// the left nav card, so a settings route renders its content bare into the center card.
// On compact (mobile) there is no shell, so the route paints its own full-screen surface
// with a back header that returns to the settings nav list (/settings).
import { useCallback, useMemo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { buildSettingsRoute } from "@/utils/host-routes";

export function SettingsRouteFrame({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}): ReactNode {
  const isCompact = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const screenStyle = useMemo(() => [frameStyles.screen, { paddingTop: insets.top }], [insets.top]);
  const handleBack = useCallback(() => router.navigate(buildSettingsRoute()), []);

  // Desktop: the shell already frames the content, so pass it straight through.
  if (!isCompact) {
    return children;
  }

  return (
    <View style={screenStyle}>
      <View style={frameStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={handleBack}
          style={frameStyles.back}
        >
          <ChevronLeft size={theme.iconSize.md} color={theme.colors.accent} />
          <Text style={frameStyles.backText}>设置</Text>
        </Pressable>
        <Text style={frameStyles.title} numberOfLines={1}>
          {title ?? "设置"}
        </Text>
      </View>
      <View style={frameStyles.body}>{children}</View>
    </View>
  );
}

const frameStyles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  header: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.accent,
  },
  title: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    zIndex: -1,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
}));
