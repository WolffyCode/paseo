import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import { createDefaultLayout } from "@/stores/workspace-layout-store";
import { FOCUSED_PANE_PLACEMENT, openTabInLayoutFocused } from "@/stores/workspace-layout-actions";
import { resolveBrowserNewTabRequest, type BrowserNewTabRequest } from ".";

function createLayoutWithBrowser(browserId: string): WorkspaceLayout {
  return openTabInLayoutFocused({
    layout: createDefaultLayout(),
    target: { kind: "browser", browserId },
    now: 1,
    placement: FOCUSED_PANE_PLACEMENT,
    explorerSidebarPaneId: null,
  })!.layout;
}

describe("browser new-tab requests", () => {
  it("accepts desktop requests from pages shown in the current workspace", () => {
    const request = resolveBrowserNewTabRequest({
      payload: {
        sourceBrowserId: "browser-1",
        url: "https://example.com/target",
        isActive: true,
      },
      workspaceLayout: createLayoutWithBrowser("browser-1"),
    });

    expect(request).toEqual<BrowserNewTabRequest>({
      sourceBrowserId: "browser-1",
      url: "https://example.com/target",
      isActive: true,
    });
  });

  it("ignores desktop requests from another workspace", () => {
    const request = resolveBrowserNewTabRequest({
      payload: {
        sourceBrowserId: "browser-from-other-workspace",
        url: "https://example.com/target",
        isActive: true,
      },
      workspaceLayout: createLayoutWithBrowser("browser-1"),
    });

    expect(request).toBeNull();
  });

  it("accepts extension pages opening their own pages in new tabs", () => {
    const request = resolveBrowserNewTabRequest({
      payload: {
        sourceBrowserId: "browser-1",
        url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html",
        isActive: true,
      },
      workspaceLayout: createLayoutWithBrowser("browser-1"),
    });

    expect(request?.url).toBe("chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html");
  });

  it("opens a page's source and searches Google for a selection, as Chrome's page menu does", () => {
    const layout = createLayoutWithBrowser("browser-1");
    const source = resolveBrowserNewTabRequest({
      payload: {
        sourceBrowserId: "browser-1",
        url: "view-source:https://example.com/",
        isActive: true,
      },
      workspaceLayout: layout,
    });
    const search = resolveBrowserNewTabRequest({
      payload: { sourceBrowserId: "browser-1", searchTerms: " hello world ", isActive: true },
      workspaceLayout: layout,
    });

    expect(source?.url).toBe("view-source:https://example.com/");
    expect(search?.url).toBe(
      "https://www.google.com/search?q=hello+world&sourceid=chrome&ie=UTF-8",
    );
  });

  it("rejects unsupported desktop request URLs", () => {
    const request = resolveBrowserNewTabRequest({
      payload: {
        sourceBrowserId: "browser-1",
        url: "file:///etc/passwd",
        isActive: true,
      },
      workspaceLayout: createLayoutWithBrowser("browser-1"),
    });

    expect(request).toBeNull();
  });
});
