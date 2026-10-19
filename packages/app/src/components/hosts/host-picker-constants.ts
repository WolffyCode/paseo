import type { TFunction } from "i18next";

export const ADD_HOST_OPTION_ID = "__add_host__";
export const ALL_HOSTS_OPTION_ID = "__all_hosts__";
export const ENABLE_BUILT_IN_DAEMON_OPTION_ID = "__enable_built_in_daemon__";

export type SystemHostPickerOptionKind = "add" | "all" | "enableBuiltInDaemon";

export const SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS: Record<SystemHostPickerOptionKind, string> = {
  add: "settings.addHost",
  all: "sidebar.display.hostFilter.all",
  enableBuiltInDaemon: "settings.enableBuiltInDaemon",
};

export function getHostPickerLabel(
  t: TFunction,
  hosts: Array<{ label: string; serverId: string }>,
  value: string,
  config?: { includeAllHost?: boolean; includeAddHost?: boolean },
): string {
  if (config?.includeAllHost && value === ALL_HOSTS_OPTION_ID) {
    return t(SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS.all);
  }
  if (config?.includeAddHost && value === ADD_HOST_OPTION_ID) {
    return t(SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS.add);
  }
  const selectedHost = hosts.find((host) => host.serverId === value);
  if (selectedHost) {
    return selectedHost.label;
  }
  if (config?.includeAllHost) {
    return t(SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS.all);
  }
  return t("hostChooser.host");
}
