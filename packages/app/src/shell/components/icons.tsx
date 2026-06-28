import {
  ChevronLeft,
  FolderTree,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Settings,
  SlidersHorizontal,
} from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { SHELL_COLORS, type ShellScheme } from "../theme/shell-tokens";

// Theme-reactive lucide icons + the two color mappers the shell uses. Wrapping each icon
// with withUnistyles lets only the icon re-render on a light/dark flip; the mappers read
// the registered theme's colorScheme discriminant and return the shell's own token color
// (the shell never pulls an app color token).

interface SchemeTheme {
  colorScheme: ShellScheme;
}

export const iconForeground = (theme: SchemeTheme) => ({
  color: SHELL_COLORS[theme.colorScheme].foreground,
});

export const iconMuted = (theme: SchemeTheme) => ({
  color: SHELL_COLORS[theme.colorScheme].foregroundMuted,
});

export const ThemedPanelLeft = withUnistyles(PanelLeft);
export const ThemedPanelRight = withUnistyles(PanelRight);
export const ThemedFolderTree = withUnistyles(FolderTree);
export const ThemedSettings = withUnistyles(Settings);
export const ThemedChevronLeft = withUnistyles(ChevronLeft);
export const ThemedMessageSquare = withUnistyles(MessageSquare);
export const ThemedSliders = withUnistyles(SlidersHorizontal);
