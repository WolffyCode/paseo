import { useEffect } from "react";
import { useBrowserStore } from "@/desktop/browser/store";
import type { WorkspaceLayout } from "@/stores/workspace-layout-actions";
import { activeConversationOwner, focusedContentTab, isWorkbenchLayout } from "@/workbench/layout";
import { recentInputForTab, useContentRecentsStore } from "./index";

/** Remembers each page, file and terminal the active conversation shows in column 3. */
export function useRecordContentRecents(input: {
  workspaceKey: string | null;
  layout: WorkspaceLayout | null;
}): void {
  const { workspaceKey, layout } = input;
  const isWorkbench = layout !== null && isWorkbenchLayout(layout);
  const owner = isWorkbench ? activeConversationOwner(layout) : null;
  const tab = isWorkbench ? focusedContentTab(layout) : null;
  const browserId = tab?.target.kind === "browser" ? tab.target.browserId : null;
  const browser = useBrowserStore((state) =>
    browserId ? (state.browsersById[browserId] ?? null) : null,
  );
  const recentInput = recentInputForTab(tab, browser);

  useEffect(() => {
    if (!workspaceKey || !owner || !recentInput) return;
    useContentRecentsStore.getState().record({ workspaceKey, owner }, recentInput);
  }, [workspaceKey, owner, recentInput]);
}
