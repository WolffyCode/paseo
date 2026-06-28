import { useLocalSearchParams } from "expo-router";
import { isSettingsSectionSlug, type SettingsSectionSlug } from "@/utils/host-routes";
import { AppSectionContent } from "@/screens/settings-codepilot/section-content";
import { SettingsRouteFrame } from "@/screens/settings-codepilot/settings-route-frame";

// App-scope settings section. The home shell paints the nav (desktop); this route fills
// the center card with the section content (and a mobile back header on compact).
export default function SettingsSectionRoute() {
  const params = useLocalSearchParams<{ section?: string }>();
  const raw = typeof params.section === "string" ? params.section : "";
  const section: SettingsSectionSlug = isSettingsSectionSlug(raw) ? raw : "general";

  return (
    <SettingsRouteFrame>
      <AppSectionContent section={section} />
    </SettingsRouteFrame>
  );
}
