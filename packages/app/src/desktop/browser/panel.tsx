import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { BrowserPane } from "@/desktop/browser/pane";
import { BrowserPageIcon, browserPageLabel } from "@/desktop/browser/page-presentation";
import { useBrowserStore } from "@/desktop/browser/store";
import { usePaneContext, usePaneFocus } from "@/panels/pane-context";
import { definePanel, type PanelDescriptor, type PanelIconProps } from "@/panels/panel-registry";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";

/** A web page is a column-3 tab: it shows the page's icon and title, as a Chrome tab does. */
function useBrowserPanelDescriptor(target: {
  kind: "browser";
  browserId: string;
}): PanelDescriptor {
  const { t } = useTranslation();
  const browser = useBrowserStore((state) => state.browsersById[target.browserId] ?? null);
  const faviconUrl = browser?.faviconUrl ?? null;
  const pageUrl = browser?.url ?? "";
  const icon = useMemo(
    () =>
      function BrowserTabIcon(props: PanelIconProps) {
        return <BrowserPageIcon {...props} faviconUrl={faviconUrl} pageUrl={pageUrl} />;
      },
    [faviconUrl, pageUrl],
  );
  const label = browserPageLabel(browser, t);

  return {
    label,
    subtitle: pageUrl,
    tooltip: label,
    titleState: "ready",
    icon,
    // Chrome swaps a loading tab's icon for its throbber.
    statusBucket: browser?.isLoading ? "running" : null,
  };
}

function BrowserPanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  const { focusPane, isInteractive } = usePaneFocus();
  const cwd = useWorkspaceDirectory(serverId, workspaceId);
  invariant(target.kind === "browser", "BrowserPanel requires browser target");
  return (
    <BrowserPane
      browserId={target.browserId}
      serverId={serverId}
      workspaceId={workspaceId}
      cwd={cwd}
      isInteractive={isInteractive}
      onFocusPane={focusPane}
    />
  );
}

export const browserPanelRegistration = definePanel("browser", {
  component: BrowserPanel,
  useDescriptor: useBrowserPanelDescriptor,
});
