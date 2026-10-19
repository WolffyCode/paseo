import { useEffect } from "react";

/**
 * Calls `onEscape` when Esc is pressed anywhere in the window while the caller is shown. A
 * "capture" listener takes the key before anything under it and keeps it from them, as Chrome's
 * bubbles and window dialogs do; a "bubble" one lets a menu open over the caller take Esc first.
 */
export function useEscapeKey(onEscape: () => void, phase: "capture" | "bubble"): void {
  useEffect(() => {
    const isCapture = phase === "capture";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (isCapture) {
        event.stopPropagation();
      }
      onEscape();
    };
    window.addEventListener("keydown", handleKeyDown, isCapture);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, isCapture);
    };
  }, [onEscape, phase]);
}
