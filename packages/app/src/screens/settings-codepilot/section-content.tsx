// Section registry — the single switch from a route slug to the codePilot content
// component that fills the detail pane. As each section is migrated it replaces its
// `ComingSoon` placeholder here; until then the placeholder still renders the real
// detail scaffold (title + subtitle) so the shell reads correctly.
import { useTranslation } from "react-i18next";
import type { HostSectionSlug, SettingsSectionSlug } from "@/utils/host-routes";
import { SettingsDetail, SettingsEmpty } from "./primitives";
import { AboutSection } from "./sections/about-section";
import { AppearanceSection } from "./sections/appearance-section";
import { DiagnosticsSection } from "./sections/diagnostics-section";
import { GeneralSection } from "./sections/general-section";
import { HostAgentsSection } from "./sections/host-agents-section";
import { HostConnectionsSection } from "./sections/host-connections-section";
import { HostTerminalsSection } from "./sections/host-terminals-section";
import { HostWorkspacesSection } from "./sections/host-workspaces-section";
import { ShortcutsSection } from "./sections/shortcuts-section";

// A migrated-but-empty section: shows the real header so the nav ↔ content stay honest.
function ComingSoon({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <SettingsDetail title={title} subtitle={subtitle}>
      <SettingsEmpty message="该设置段正在迁移到新的 codePilot 界面。" />
    </SettingsDetail>
  );
}

// Render the App-scope section for `section`.
export function AppSectionContent({ section }: { section: SettingsSectionSlug }) {
  const { t } = useTranslation();
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
      return <ComingSoon title={t("settings.sections.general")} />;
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
  const { t } = useTranslation();
  switch (section) {
    case "connections":
      return <HostConnectionsSection serverId={serverId} />;
    case "agents":
      return <HostAgentsSection serverId={serverId} />;
    case "workspaces":
      return <HostWorkspacesSection serverId={serverId} />;
    case "providers":
      return <ComingSoon title={t("settings.hostSections.providers")} />;
    case "usage":
      return <ComingSoon title={t("settings.hostSections.usage")} />;
    case "terminals":
      return <HostTerminalsSection serverId={serverId} />;
    case "host":
      return <ComingSoon title={t("settings.hostSections.host")} />;
    default:
      return <ComingSoon title={t("settings.hostSections.connections")} />;
  }
}
