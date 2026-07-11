export interface DesktopOpenTarget {
  readonly id: string;
  readonly label: string;
  readonly kind: "editor" | "file-manager";
}

/** Select the host platform's file-manager target without assuming a macOS-specific id. */
export function selectFileManagerTargetId(targets: readonly DesktopOpenTarget[]): string | null {
  const fileManager = targets.find((target) => target.kind === "file-manager");
  return fileManager?.id ?? null;
}
