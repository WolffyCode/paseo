import React, { createContext, memo, type ReactNode, useContext } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import { RetainedPanelSurface } from "./retained-panel-surface";

const RetainedPanelActiveContext = createContext(true);

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
  return (
    <RetainedPanelActivity active={active}>
      <RetainedPanelSurface active={active} animated={animated} style={style} testID={testID}>
        {children}
      </RetainedPanelSurface>
    </RetainedPanelActivity>
  );
});
