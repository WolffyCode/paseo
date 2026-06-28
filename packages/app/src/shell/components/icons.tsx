import {
  ChevronLeft,
  FolderTree,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Settings,
  SlidersHorizontal,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { ShellTokens } from "../theme/theme-model";

// The shell's lucide icons + the two token→color mappers. Icons are plain lucide
// components; the owning component is an `observer` that reads themeModel.tokens and passes
// the role color via the `color` prop, so an icon repaints on a scheme flip without any
// per-icon theme wrapper (no withUnistyles, no Unistyles theme dependency).

export type ShellIcon = ComponentType<{ size?: number; color?: string }>;

// foreground = active/primary; muted = resting/secondary. Components pick one from the
// active token set in render.
export const iconForeground = (tokens: ShellTokens): string => tokens.foreground;
export const iconMuted = (tokens: ShellTokens): string => tokens.foregroundMuted;

export const ShellPanelLeft: ShellIcon = PanelLeft;
export const ShellPanelRight: ShellIcon = PanelRight;
export const ShellFolderTree: ShellIcon = FolderTree;
export const ShellSettings: ShellIcon = Settings;
export const ShellChevronLeft: ShellIcon = ChevronLeft;
export const ShellMessageSquare: ShellIcon = MessageSquare;
export const ShellSliders: ShellIcon = SlidersHorizontal;
