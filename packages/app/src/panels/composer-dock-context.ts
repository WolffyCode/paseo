import { createContext, useContext } from "react";

/**
 * Signals that an agent conversation panel is being rendered as the bottom "composer
 * dock" while the right tool panel is maximized. In that mode the panel renders only
 * its composer (no message stream, no overlays) so the user can keep chatting while a
 * tool fills the canvas. Default `false` = normal full-panel rendering.
 */
const ComposerDockContext = createContext(false);

export const ComposerDockProvider = ComposerDockContext.Provider;

export function useIsComposerDock(): boolean {
  return useContext(ComposerDockContext);
}
