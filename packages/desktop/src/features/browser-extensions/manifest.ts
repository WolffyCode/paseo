/** The manifest fields Helm reads. A Chrome extension manifest has many more. */
export interface ExtensionManifest {
  description?: string;
  homepage_url?: string;
  options_page?: string;
  options_ui?: { page?: string };
  icons?: Record<string, string>;
  permissions?: unknown[];
  host_permissions?: unknown[];
  content_scripts?: Array<{ matches?: unknown[] }>;
  chrome_url_overrides?: { newtab?: string };
  chrome_settings_overrides?: {
    homepage?: string;
    search_provider?: { search_url?: string };
    startup_pages?: string[];
  };
}

/** What an extension asks for when it installs: the input to Chrome's install prompt warnings. */
export interface ExtensionPermissionRequest {
  apiPermissions: string[];
  hostPatterns: string[];
  overridesNewTabPage: boolean;
  homepageUrl: string | null;
  searchUrl: string | null;
  startupPageUrl: string | null;
}

const ALL_URLS_PATTERN = "<all_urls>";

// Manifest V2 lists host patterns among the API permissions; a pattern always names a scheme.
function isHostPattern(permission: string): boolean {
  return permission === ALL_URLS_PATTERN || permission.includes("://");
}

function strings(values: unknown[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => typeof value === "string");
}

/**
 * Chrome counts content script matches as host access: a script injected into every site reads
 * every site, so the prompt warns about it the same way.
 */
export function readPermissionRequest(manifest: ExtensionManifest): ExtensionPermissionRequest {
  const permissions = strings(manifest.permissions);
  const contentScriptMatches = (manifest.content_scripts ?? []).flatMap((script) =>
    strings(script.matches),
  );
  const hostPatterns = [
    ...permissions.filter(isHostPattern),
    ...strings(manifest.host_permissions),
    ...contentScriptMatches,
  ];
  const settingsOverrides = manifest.chrome_settings_overrides;
  return {
    apiPermissions: permissions.filter((permission) => !isHostPattern(permission)),
    hostPatterns: [...new Set(hostPatterns)],
    overridesNewTabPage: typeof manifest.chrome_url_overrides?.newtab === "string",
    homepageUrl: settingsOverrides?.homepage ?? null,
    searchUrl: settingsOverrides?.search_provider?.search_url ?? null,
    startupPageUrl: settingsOverrides?.startup_pages?.[0] ?? null,
  };
}

/** The manifest icon to draw at `size` pixels: the smallest that is large enough, else the largest. */
export function manifestIconPath(manifest: ExtensionManifest, size: number): string | null {
  const icons = Object.entries(manifest.icons ?? {})
    .map(([iconSize, iconPath]) => ({ size: Number(iconSize), path: iconPath }))
    .filter((icon) => Number.isFinite(icon.size) && typeof icon.path === "string")
    .sort((left, right) => left.size - right.size);
  const largeEnough = icons.find((icon) => icon.size >= size);
  return (largeEnough ?? icons.at(-1))?.path ?? null;
}
