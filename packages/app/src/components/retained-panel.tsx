import React, {
  createContext,
  memo,
  type ReactNode,
  useContext,
  useCallback,
  useLayoutEffect,
  useState,
} from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import { RetainedPanelSurface } from "./retained-panel-surface";

const RetainedPanelActiveContext = createContext(true);
const RetainedPanelPaintContext = createContext<(() => () => void) | null>(null);

/** Keep native guest frames paintable while their retained UI is inactive. */
export function useRetainedPanelPaint(enabled: boolean) {
  const retain = useContext(RetainedPanelPaintContext);
  useLayoutEffect(() => (enabled ? retain?.() : undefined), [enabled, retain]);
}

export function useRetainedPanelActive(): boolean {
  return useContext(RetainedPanelActiveContext);
}

interface RetainedPanelProps {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  animated?: boolean;
}

interface RetainedPanelActivityProps {
  active: boolean;
  children: ReactNode;
}

export function RetainedPanelActivity({ active, children }: RetainedPanelActivityProps) {
  const parentActive = useRetainedPanelActive();
  return (
    <RetainedPanelActiveContext value={parentActive && active}>
      {children}
    </RetainedPanelActiveContext>
  );
}

/**
 * Keeps expensive panel state mounted without letting an inactive panel render
 * on screen. The stable, non-collapsible native root is intentional: retained
 * panels must not detach or reparent their native descendants when visibility
 * changes.
 */
export const RetainedPanel = memo(function RetainedPanel({
  active,
  children,
  style,
  testID,
  animated = false,
}: RetainedPanelProps) {
  const retainParent = useContext(RetainedPanelPaintContext);
  const [paintOwners, setPaintOwners] = useState(0);
  const retainPaint = useCallback(() => {
    const releaseParent = retainParent?.();
    setPaintOwners((count) => count + 1);
    return () => {
      setPaintOwners((count) => count - 1);
      releaseParent?.();
    };
  }, [retainParent]);
  return (
    <RetainedPanelPaintContext value={retainPaint}>
      <RetainedPanelActivity active={active}>
        <RetainedPanelSurface
          active={active}
          animated={animated}
          preservePaint={paintOwners > 0}
          style={style}
          testID={testID}
        >
          {children}
        </RetainedPanelSurface>
      </RetainedPanelActivity>
    </RetainedPanelPaintContext>
  );
});
