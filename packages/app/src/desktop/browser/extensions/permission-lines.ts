import type { TFunction } from "i18next";
import type { DesktopBrowserExtensionPermissionRequest } from "@/desktop/host";
import {
  extensionPermissionWarnings,
  type ExtensionPermissionWarning,
  type PermissionHost,
} from "./permission-warnings";

/** One permission sentence as Chrome words it, with sub-items for a long list of sites. */
export interface PermissionLine {
  text: string;
  details: string[];
}

// Up to three hosts fit in one sentence; more become a list under a summary line.
const MAX_HOSTS_IN_SENTENCE = 3;

function hostLabel(t: TFunction, permissionHost: PermissionHost, isListItem: boolean): string {
  if (!permissionHost.isWholeDomain) {
    return permissionHost.host;
  }
  const key = isListItem ? "hostAndSubdomainList" : "hostAndSubdomain";
  return t(`workspace.browser.extensions.permissions.${key}`, { website1: permissionHost.host });
}

function hostsLine(t: TFunction, hosts: readonly PermissionHost[]): PermissionLine {
  if (hosts.length > MAX_HOSTS_IN_SENTENCE) {
    return {
      text: t("workspace.browser.extensions.permissions.hostsList"),
      details: hosts.map((permissionHost) => hostLabel(t, permissionHost, true)),
    };
  }
  const [website1 = "", website2 = "", website3 = ""] = hosts.map((permissionHost) =>
    hostLabel(t, permissionHost, false),
  );
  const keyByCount = ["oneHost", "twoHosts", "threeHosts"] as const;
  const key = keyByCount[hosts.length - 1] ?? "oneHost";
  return {
    text: t(`workspace.browser.extensions.permissions.${key}`, { website1, website2, website3 }),
    details: [],
  };
}

function permissionLine(t: TFunction, warning: ExtensionPermissionWarning): PermissionLine {
  if (warning.kind === "hosts") {
    return hostsLine(t, warning.hosts);
  }
  if (warning.kind === "setting") {
    return {
      text: t(`workspace.browser.extensions.permissions.${warning.message}`, {
        value: warning.value,
      }),
      details: [],
    };
  }
  return { text: t(`workspace.browser.extensions.permissions.${warning.message}`), details: [] };
}

/** What an extension may do, in Chrome's words and order (install prompt, details page). */
export function permissionLines(
  t: TFunction,
  request: DesktopBrowserExtensionPermissionRequest,
): PermissionLine[] {
  return extensionPermissionWarnings(request).map((warning) => permissionLine(t, warning));
}
