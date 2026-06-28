import { getIsElectron, isNative } from "@/constants/platform";

// The shell's own window-drag overlay for the Electron desktop title bar. A static,
// non-interactive layer marked `-webkit-app-region: drag` so empty top-bar areas move
// the window; interactive controls sit above it and opt out via their own no-drag. Null
// off Electron (browser/native have no custom title bar). Place as the first child of the
// top bar.

// WebkitAppRegion is an Electron CSS extension (not in the DOM CSS typings); the as-const
// object carries it through to the div untyped, which is exactly what we want here.
const DRAG_OVERLAY_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  WebkitAppRegion: "drag",
} as const;

export function ShellTitlebarDragRegion() {
  if (isNative || !getIsElectron()) {
    return null;
  }
  return <div style={DRAG_OVERLAY_STYLE} />;
}
