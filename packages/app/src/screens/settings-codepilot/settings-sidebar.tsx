// The settings nav — renders into the shell's left card (same 240px region as the
// conversation tree, so opening settings never resizes the sidebar). Top: a back row
// out of settings. Below: the App sections, then the Host sections scoped to the
// selected host. Active highlight + the host id come from one truth: parseSettingsRoute.
import { Fragment, useCallback, useMemo, type ComponentType } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { ChevronDown, ChevronLeft, Laptop } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useUnistyles } from "react-native-unistyles";
import { isNative } from "@/constants/platform";
import { useHosts, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import { normalizeHostLabel } from "@/types/host-connection";
import { resolveActiveHost } from "@/utils/active-host";
import {
  buildSettingsHostSectionRoute,
  buildSettingsSectionRoute,
  parseSettingsRoute,
  type HostSectionSlug,
  type SettingsSectionSlug,
} from "@/utils/host-routes";
import { APP_NAV_ITEMS, HOST_NAV_ITEMS } from "./nav-model";
import { SettingsStatusDot } from "./primitives";
import { settingsKit } from "./styles";

type NavIcon = ComponentType<{ size?: number; color?: string }>;

// One nav row: leading icon + label, optional trailing desktop-only marker. Hover tints
// on web; the active row gets the light-gray selection fill + dark-gray medium text.
function NavRow<Id extends string>({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
  deskOnly,
}: {
  id: Id;
  label: string;
  icon: NavIcon;
  active: boolean;
  onSelect: (id: Id) => void;
  deskOnly?: boolean;
}) {
  const { theme } = useUnistyles();
  const handlePress = useCallback(() => onSelect(id), [onSelect, id]);
  const baseStyle = useMemo(
    () => (active ? [settingsKit.navRow, settingsKit.navRowActive] : [settingsKit.navRow]),
    [active],
  );
  const hoverStyle = useMemo(
    () =>
      active
        ? [settingsKit.navRow, settingsKit.navRowActive]
        : [settingsKit.navRow, settingsKit.navRowHover],
    [active],
  );
  const textStyle = useMemo(
    () =>
      active ? [settingsKit.navRowText, settingsKit.navRowTextActive] : settingsKit.navRowText,
    [active],
  );
  const iconColor = active ? theme.colors.secondaryForeground : theme.colors.foregroundMuted;
  const a11yState = useMemo(() => ({ selected: active }), [active]);
  return (
    <Pressable accessibilityRole="button" accessibilityState={a11yState} onPress={handlePress}>
      {({ hovered }) => (
        <View style={hovered ? hoverStyle : baseStyle}>
          <Icon size={theme.iconSize.sm} color={iconColor} />
          <Text style={textStyle}>{label}</Text>
          {deskOnly ? (
            <Laptop
              size={theme.iconSize.xs}
              color={theme.colors.foregroundMuted}
              style={settingsKit.navDeskMark}
            />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// The "exit settings" row at the top of the nav.
function BackRow({ onPress }: { onPress: () => void }) {
  const { theme } = useUnistyles();
  const hoverStyle = useMemo(() => [settingsKit.navBack, settingsKit.navRowHover], []);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onPress}>
      {({ hovered }) => (
        <View style={hovered ? hoverStyle : settingsKit.navBack}>
          <ChevronLeft size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          <Text style={settingsKit.navBackText}>返回</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SettingsSidebar() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const pathname = usePathname();
  const hosts = useHosts();

  const location = useMemo(() => parseSettingsRoute(pathname), [pathname]);
  const activeHost = useMemo(() => resolveActiveHost({ hosts, pathname }), [hosts, pathname]);
  // The host these Host-scope rows act on: the route's host if we're inside one, else
  // the active/first host so the rows are still reachable from an App section.
  const settingsHostId =
    location?.kind === "host" || location?.kind === "hostRoot"
      ? location.serverId
      : (activeHost?.serverId ?? hosts[0]?.serverId ?? null);

  const settingsHost = useMemo(
    () => hosts.find((host) => host.serverId === settingsHostId) ?? null,
    [hosts, settingsHostId],
  );
  const hostConnected = useHostRuntimeIsConnected(settingsHostId ?? "");

  const appActiveId = location?.kind === "app" ? location.section : null;
  const hostActiveId = location?.kind === "host" ? location.section : null;

  const handleBack = useCallback(() => {
    if (!navigateToLastWorkspace()) {
      router.back();
    }
  }, []);
  const handleSelectApp = useCallback((id: SettingsSectionSlug) => {
    router.navigate(buildSettingsSectionRoute(id));
  }, []);
  const handleSelectHost = useCallback(
    (id: HostSectionSlug) => {
      if (settingsHostId) {
        router.navigate(buildSettingsHostSectionRoute(settingsHostId, id));
      }
    },
    [settingsHostId],
  );

  return (
    <View style={settingsKit.navRoot}>
      <ScrollView contentContainerStyle={settingsKit.navScroll}>
        <BackRow onPress={handleBack} />

        <Text style={settingsKit.navGroupLabel}>应用</Text>
        {APP_NAV_ITEMS.map((item) => {
          if (item.hiddenOnNative && isNative) {
            return null;
          }
          return (
            <Fragment key={item.id}>
              {item.separatorBefore ? <View style={settingsKit.navSep} /> : null}
              <NavRow
                id={item.id}
                label={t(item.labelKey)}
                icon={item.icon}
                active={appActiveId === item.id}
                deskOnly={item.hiddenOnNative}
                onSelect={handleSelectApp}
              />
            </Fragment>
          );
        })}

        <Text style={settingsKit.navGroupLabel}>主机</Text>
        {settingsHost ? (
          <View style={settingsKit.hostPick}>
            <SettingsStatusDot status={hostConnected ? "on" : "idle"} />
            <Text style={settingsKit.hostPickName} numberOfLines={1}>
              {normalizeHostLabel(settingsHost.label, settingsHost.serverId)}
            </Text>
            <ChevronDown size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          </View>
        ) : null}
        {settingsHostId
          ? HOST_NAV_ITEMS.map((item) => (
              <NavRow
                key={item.id}
                id={item.id}
                label={t(item.labelKey)}
                icon={item.icon}
                active={hostActiveId === item.id}
                onSelect={handleSelectHost}
              />
            ))
          : null}
      </ScrollView>
    </View>
  );
}
