import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useIsFocused } from "@react-navigation/native";
import { RetainedPanel, useRetainedPanelActive } from "@/components/retained-panel";
import type {
  WorkbenchRegion,
  WorkbenchRegionContentProps,
  WorkbenchRegionHostProps,
} from "./regions";

const RegionTargets = createContext<{
  targets: Partial<Record<WorkbenchRegion, HTMLDivElement | null>>;
  setTarget: (region: WorkbenchRegion, target: HTMLDivElement | null) => void;
} | null>(null);

const HOST_STYLE: CSSProperties = {
  display: "flex",
  flex: 1,
  flexDirection: "column",
  position: "relative",
  minWidth: 0,
  minHeight: 0,
};

export function WorkbenchRegionProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<Partial<Record<WorkbenchRegion, HTMLDivElement | null>>>(
    {},
  );
  const setTarget = useCallback((region: WorkbenchRegion, target: HTMLDivElement | null) => {
    setTargets((current) =>
      current[region] === target ? current : { ...current, [region]: target },
    );
  }, []);
  const value = useMemo(() => ({ targets, setTarget }), [targets, setTarget]);
  return <RegionTargets value={value}>{children}</RegionTargets>;
}

export function WorkbenchRegionHost({ region, children }: WorkbenchRegionHostProps) {
  const context = useContext(RegionTargets);
  const setTarget = context?.setTarget;
  const ref = useCallback(
    (target: HTMLDivElement | null) => setTarget?.(region, target),
    [region, setTarget],
  );
  return (
    <div ref={ref} style={HOST_STYLE} data-testid={`workbench-slot-${region}`}>
      {children}
    </div>
  );
}

/** Preserve the page's route context while the persistent shell owns its physical columns. */
export function WorkbenchRegionContent({
  region,
  active = true,
  children,
  testID,
}: WorkbenchRegionContentProps) {
  const context = useContext(RegionTargets);
  const focused = useIsFocused();
  const parentActive = useRetainedPanelActive();
  const target = context?.targets[region];
  if (!target) return null;
  return createPortal(
    <RetainedPanel active={active && focused && parentActive} animated testID={testID}>
      {children}
    </RetainedPanel>,
    target,
  );
}
