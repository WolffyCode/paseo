import type { ThemeScheme } from "../../theme/theme-model";

// The right panel's status colors (danger / warning / success), per chrome scheme, verbatim from ui.html's
// --destructive / --warning / --success. ShellTokens carries only the neutral + accent palette, so these
// semantic status hues (save-state indicators, no-result count, conflict/offline bars, error states) live
// here as the panel's own design tokens — chrome-following like everything else, one key set per scheme.

export interface StatusTokens {
  danger: string;
  warning: string;
  success: string;
}

export const STATUS_TOKENS: Record<ThemeScheme, StatusTokens> = {
  light: { danger: "#cf222e", warning: "#9a6700", success: "#1a7f37" },
  dark: { danger: "#f85149", warning: "#d29922", success: "#3fb950" },
};
