import { ThemeProvider, useTheme } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Stack } from "expo-router";
import { isValidElement, type ReactElement, type ReactNode, useCallback, useMemo } from "react";
import { withUnistyles } from "react-native-unistyles";
import { AppearanceStyleBoundary } from "@/components/appearance-style-boundary";
import { isWeb } from "@/constants/platform";

interface ThemedStackBaseProps {
  backgroundColor: string;
  children?: ReactNode;
  screenOptions?: NativeStackNavigationOptions;
  // Screens whose content is another navigator. That navigator owns its own screens' appearance
  // boundary; wrapping it here would remount it.
  nestedNavigatorScreens?: readonly string[];
}

interface ScreenContent {
  route: { name: string };
  children: ReactNode;
}

function ThemedStackBase({
  backgroundColor,
  children,
  screenOptions,
  nestedNavigatorScreens,
}: ThemedStackBaseProps) {
  // The screen background goes through the navigation theme, not contentStyle: on web the stack
  // paints each screen's full-size Background layer from colors.background, which contentStyle
  // never reaches. The native stack reads the same color as its default content style.
  const inheritedTheme = useTheme();
  const navigationTheme = useMemo(
    () => ({
      ...inheritedTheme,
      colors: { ...inheritedTheme.colors, background: backgroundColor },
    }),
    [backgroundColor, inheritedTheme],
  );
  // Appearance changes remount each screen's content below the native stack, so the navigator
  // and its screen containers keep their identity. See docs/unistyles.md.
  const screenLayout = useCallback(
    ({ route, children: content }: ScreenContent): ReactElement => {
      if (nestedNavigatorScreens?.includes(route.name) && isValidElement(content)) return content;
      return <AppearanceStyleBoundary>{content}</AppearanceStyleBoundary>;
    },
    [nestedNavigatorScreens],
  );

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={screenOptions} screenLayout={screenLayout}>
        {children}
      </Stack>
    </ThemeProvider>
  );
}

export const ThemedStack = withUnistyles(ThemedStackBase, (theme) => ({
  // Web screens stay transparent so the workbench's rounded glass columns show through.
  backgroundColor: isWeb ? "transparent" : theme.colors.surface0,
}));
