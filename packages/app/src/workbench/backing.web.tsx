import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from "react";
import { withUnistyles } from "react-native-unistyles";
import { workbenchModel } from "./runtime";

function Backing({
  active,
  children,
  material,
  opaque,
}: {
  active: boolean;
  children: ReactNode;
  material: string;
  opaque: string;
}) {
  const snapshot = useSyncExternalStore(workbenchModel.subscribe, workbenchModel.getSnapshot);
  useEffect(() => {
    const transparency = window.matchMedia("(prefers-reduced-transparency: reduce)");
    const contrast = window.matchMedia("(prefers-contrast: more)");
    const update = () =>
      workbenchModel.setReducedTransparency(transparency.matches || contrast.matches);
    update();
    transparency.addEventListener("change", update);
    contrast.addEventListener("change", update);
    return () => {
      transparency.removeEventListener("change", update);
      contrast.removeEventListener("change", update);
    };
  }, []);
  const style = useMemo<CSSProperties>(
    () => ({
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      minHeight: 0,
      position: "relative",
      padding: active ? "0 8px 8px 0" : undefined,
      borderRadius: active ? 14 : undefined,
      overflow: "hidden",
      backgroundColor: active && !snapshot.reducedTransparency ? material : opaque,
    }),
    [active, snapshot.reducedTransparency, material, opaque],
  );
  return <div style={style}>{children}</div>;
}

export const WorkbenchBacking = withUnistyles(Backing, (theme) => ({
  material: theme.colors.workbenchWindow,
  opaque: theme.colors.surface0,
}));
