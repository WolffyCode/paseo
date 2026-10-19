import { useCallback, useState } from "react";
import type { NativeSyntheticEvent, TargetedEvent } from "react-native";

/**
 * Whether a control has keyboard focus, which Chrome's WebUI outlines (its
 * .focus-outline-visible) and a click leaves plain: the browser's :focus-visible.
 */
export function useFocusVisible(): {
  isFocusVisible: boolean;
  handleFocus: (event: NativeSyntheticEvent<TargetedEvent>) => void;
  handleBlur: () => void;
} {
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const handleFocus = useCallback((event: NativeSyntheticEvent<TargetedEvent>) => {
    const target: unknown = event.target;
    setIsFocusVisible(target instanceof HTMLElement && target.matches(":focus-visible"));
  }, []);
  const handleBlur = useCallback(() => setIsFocusVisible(false), []);
  return { isFocusVisible, handleFocus, handleBlur };
}
