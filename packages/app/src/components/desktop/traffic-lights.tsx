import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { getIsElectronRuntime } from "@/constants/layout";
import { isWeb } from "@/constants/platform";

/**
 * macOS-style traffic lights, DOM-drawn for the WEB browser only.
 *
 * The Electron desktop client uses the OS-native traffic lights (positioned via `trafficLightPosition`),
 * so a plain browser tab — which has none — would otherwise leave the reserved top-left gap empty and the
 * chrome would look different from the app. We draw a matching set so the browser chrome is identical to
 * the desktop client (反馈: 浏览器和客户端不做两套 UI)。
 *
 * Decorative / non-interactive: a browser tab has no window close-minimize-maximize, so the dots are
 * `pointerEvents="none"`. Position matches Electron's `trafficLightPosition` ({ x: 16, y: 14 }).
 */
export function TrafficLights() {
  if (!isWeb || getIsElectronRuntime()) {
    return null;
  }

  return (
    <View style={styles.lights} pointerEvents="none">
      <View style={styles.redDot} />
      <View style={styles.yellowDot} />
      <View style={styles.greenDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  lights: {
    position: "absolute",
    // Match Electron trafficLightPosition { x: 16, y: 14 }; 12px dots → vertical center ~y20, aligning
    // with the chrome □ (which the desktop-window padding centers on the lights).
    top: 14,
    left: 16,
    flexDirection: "row",
    gap: 8,
    zIndex: 50,
  },
  redDot: { width: 12, height: 12, borderRadius: 9999, backgroundColor: "#ff5f57" },
  yellowDot: { width: 12, height: 12, borderRadius: 9999, backgroundColor: "#febc2e" },
  greenDot: { width: 12, height: 12, borderRadius: 9999, backgroundColor: "#28c840" },
});
