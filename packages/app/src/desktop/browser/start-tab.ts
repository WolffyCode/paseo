import { BROWSER_START_URL } from "@/desktop/browser/start-page";
import { createWorkspaceBrowser } from "@/desktop/browser/store";
import { generateMessageId } from "@/types/stream";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export function createBrowserStartTab(): WorkspaceTab {
  const { browserId } = createWorkspaceBrowser({ initialUrl: BROWSER_START_URL });
  return {
    tabId: `tab_${generateMessageId()}`,
    target: { kind: "browser", browserId },
    createdAt: Date.now(),
  };
}
