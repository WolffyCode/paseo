// A raw DOM "click" subscription for web toggle buttons, bypassing RN-web's synthetic press
// pipeline entirely. Probe data from the chairman's real mouse showed the browser delivered EVERY
// native click (32/32 on target) while the Pressable press pipeline dropped about half of them
// under rapid toggling — each toggle re-render invalidated the in-flight press session and ate the
// next tap. The browser's own click event cannot be eaten by React re-renders, and it also covers
// keyboard activation (Enter/Space synthesize a click on role=button). No-op off web — native
// callers keep Pressable's onPress. Lives in components/ (not util/) because it is a React hook;
// util/ stays a zero-React layer.

import { type RefObject, useEffect, useRef } from "react";
import type { View } from "react-native";
import { isWeb } from "@/constants/platform";

/**
 * Attach the returned ref to a Pressable; on web its host DOM node gets a raw click listener that
 * calls `onPress` unless `disabled`. Reads the LATEST onPress/disabled per event (no re-subscribe
 * churn, no stale-closure misses).
 */
export function useWebDomClick(input: {
  onPress: () => void;
  disabled: boolean;
}): RefObject<View | null> {
  const hostRef = useRef<View | null>(null);
  const latestRef = useRef(input);
  latestRef.current = input;
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const node = hostRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== "function") {
      return;
    }
    const onDomClick = (): void => {
      if (!latestRef.current.disabled) {
        latestRef.current.onPress();
      }
    };
    node.addEventListener("click", onDomClick);
    return () => node.removeEventListener("click", onDomClick);
  }, []);
  return hostRef;
}
