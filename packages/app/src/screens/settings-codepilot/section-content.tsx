// Section registry — the single switch from a route slug to the codePilot content
// component that fills the detail pane. Every App + Host section is migrated, so there
// is no placeholder: the slug maps directly to its section component.
import type { HostSectionSlug, SettingsSectionSlug } from "@/utils/host-routes";
import { AboutSection } from "./sections/about-section";
import { AppearanceSection } from "./sections/appearance-section";
import { DiagnosticsSection } from "./sections/diagnostics-section";
import { GeneralSection } from "./sections/general-section";
import { HostAgentsSection } from "./sections/host-agents-section";
import { HostConnectionsSection } from "./sections/host-connections-section";
import { HostProvidersSection } from "./sections/host-providers-section";
import { HostSettingsSection } from "./sections/host-settings-section";
import { HostTerminalsSection } from "./sections/host-terminals-section";
import { HostUsageSection } from "./sections/host-usage-section";
import { HostWorkspacesSection } from "./sections/host-workspaces-section";
import { ShortcutsSection } from "./sections/shortcuts-section";

// Render the App-scope section for `section`.
export function AppSectionContent({ section }: { section: SettingsSectionSlug }) {
  switch (section) {
    case "general":
      return <GeneralSection />;
    case "appearance":
      return <AppearanceSection />;
    case "shortcuts":
      return <ShortcutsSection />;
    case "diagnostics":
      return <DiagnosticsSection />;
    case "about":
      return <AboutSection />;
    default:
      return <GeneralSection />;
  }
}

// Render the Host-scope section for `section`, scoped to `serverId`.
export function HostSectionContent({
  serverId,
  section,
}: {
  serverId: string;
  section: HostSectionSlug;
}) {
  switch (section) {
    case "connections":
      return <HostConnectionsSection serverId={serverId} />;
    case "agents":
      return <HostAgentsSection serverId={serverId} />;
    case "workspaces":
      return <HostWorkspacesSection serverId={serverId} />;
    case "providers":
      return <HostProvidersSection serverId={serverId} />;
    case "usage":
      return <HostUsageSection serverId={serverId} />;
    case "terminals":
      return <HostTerminalsSection serverId={serverId} />;
    case "host":
      return <HostSettingsSection serverId={serverId} />;
    default:
      return <HostConnectionsSection serverId={serverId} />;
  }
}
