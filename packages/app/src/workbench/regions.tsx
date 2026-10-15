import type { ReactNode } from "react";

export type WorkbenchRegion = "navigation" | "content" | "files" | "toolbar";
export interface WorkbenchRegionHostProps {
  region: WorkbenchRegion;
  children?: ReactNode;
}
export interface WorkbenchRegionContentProps extends WorkbenchRegionHostProps {
  active?: boolean;
  testID?: string;
}

export function WorkbenchRegionProvider({ children }: { children: ReactNode }) {
  return children;
}

export function WorkbenchRegionHost({ children }: WorkbenchRegionHostProps) {
  return children;
}

export function WorkbenchRegionContent({ children }: WorkbenchRegionContentProps) {
  return children;
}
