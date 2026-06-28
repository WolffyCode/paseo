import { useLocalSearchParams } from "expo-router";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { normalizeHostSectionSlug } from "@/utils/host-routes";
import { HostSectionContent } from "@/screens/settings-codepilot/section-content";
import { SettingsRouteFrame } from "@/screens/settings-codepilot/settings-route-frame";

// Host-scope settings section, scoped to `serverId`. Same shell contract as the app
// sections; wrapped in the bootstrap boundary so the host runtime is connected first.
export default function SettingsHostSectionRoute() {
  const params = useLocalSearchParams<{ serverId?: string; hostSection?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId.trim() : "";
  const rawSection = typeof params.hostSection === "string" ? params.hostSection : "";
  const section = normalizeHostSectionSlug(rawSection) ?? "connections";

  return (
    <HostRouteBootstrapBoundary>
      <SettingsRouteFrame>
        <HostSectionContent serverId={serverId} section={section} />
      </SettingsRouteFrame>
    </HostRouteBootstrapBoundary>
  );
}
