import { useLayoutEffect, useState } from "react";

/** Where an element sits in the window, in CSS pixels. */
export interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where `element` sits in the window, kept current as it moves or resizes. Overlays over a page
 * render in the overlay root above the webview plane, so they place themselves with this.
 */
export function useElementBounds(element: HTMLElement | null): ElementBounds | null {
  const [bounds, setBounds] = useState<ElementBounds | null>(null);

  useLayoutEffect(() => {
    if (!element) {
      setBounds(null);
      return;
    }
    const update = () => {
      const rect = element.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [element]);

  return bounds;
}
