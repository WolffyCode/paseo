import { panelCanLaunchInPane, panelSupportsHost, type PaneHost } from "@/panels/panel-manifest";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export function canLaunchPanel(input: {
  kind: WorkspaceTabTarget["kind"];
  host: PaneHost;
  surface: "menu" | "panel";
  panePanelKinds: readonly WorkspaceTabTarget["kind"][];
}): boolean {
  return (
    panelSupportsHost(input.kind, input.host) &&
    (input.surface !== "menu" || panelCanLaunchInPane(input.kind, input.panePanelKinds))
  );
}

export const PRIMARY_LAUNCH_ORDER = [
  "agent",
  "terminal",
  "changes",
  "diff",
  "files",
  "browser",
  "pullRequest",
] as const;

export const SUPPORTING_LAUNCH_ORDER = [
  "changes",
  "terminal",
  "diff",
  "files",
  "agent",
  "browser",
  "pullRequest",
] as const;

export type BuiltInLaunchItemId = (typeof PRIMARY_LAUNCH_ORDER)[number];

export function getBuiltInLaunchOrder(purpose: "primary" | "supporting") {
  return purpose === "supporting" ? SUPPORTING_LAUNCH_ORDER : PRIMARY_LAUNCH_ORDER;
}
