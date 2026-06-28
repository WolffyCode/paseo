// The settings navigation IA (data only). Two groups: the App sections (device-local)
// and the per-Host sections (scoped to the selected host). Mirrors the approved app /
// host design boards. Icons are lucide components; labels are i18n keys.
import type { ComponentType } from "react";
import {
  Bot,
  Boxes,
  FolderGit2,
  Gauge,
  Info,
  Keyboard,
  Network,
  Palette,
  Server,
  Settings,
  SquareTerminal,
  Stethoscope,
} from "lucide-react-native";

type NavIcon = ComponentType<{ size?: number; color?: string }>;

// An App-scope section. `separatorBefore` reproduces the board's divider between the
// preferences cluster and the diagnostics/about cluster. `hiddenOnNative` hides rows
// that need a hardware keyboard (shortcuts) on touch devices.
export interface AppNavItem {
  id: "general" | "appearance" | "shortcuts" | "diagnostics" | "about";
  labelKey: string;
  icon: NavIcon;
  separatorBefore?: boolean;
  hiddenOnNative?: boolean;
}

// A Host-scope section, scoped to the currently selected host.
export interface HostNavItem {
  id: "connections" | "agents" | "workspaces" | "providers" | "usage" | "terminals" | "host";
  labelKey: string;
  icon: NavIcon;
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  { id: "general", labelKey: "settings.sections.general", icon: Settings },
  { id: "appearance", labelKey: "settings.sections.appearance", icon: Palette },
  {
    id: "shortcuts",
    labelKey: "settings.sections.shortcuts",
    icon: Keyboard,
    hiddenOnNative: true,
  },
  {
    id: "diagnostics",
    labelKey: "settings.sections.diagnostics",
    icon: Stethoscope,
    separatorBefore: true,
  },
  { id: "about", labelKey: "settings.sections.about", icon: Info },
];

export const HOST_NAV_ITEMS: HostNavItem[] = [
  { id: "connections", labelKey: "settings.hostSections.connections", icon: Network },
  { id: "agents", labelKey: "settings.hostSections.agents", icon: Bot },
  { id: "workspaces", labelKey: "settings.hostSections.workspaces", icon: FolderGit2 },
  { id: "providers", labelKey: "settings.hostSections.providers", icon: Boxes },
  { id: "usage", labelKey: "settings.hostSections.usage", icon: Gauge },
  { id: "terminals", labelKey: "settings.hostSections.terminals", icon: SquareTerminal },
  { id: "host", labelKey: "settings.hostSections.host", icon: Server },
];
