import { page } from "vitest/browser";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetBrowserHostRuntimeFixtures,
  setBrowserHostRuntimeFixtures,
} from "../../../../test-stubs/host-runtime.browser";
import { HostSwitcher } from "./host-switcher";

const switchedHosts: string[] = [];
const reconnectedHosts: string[] = [];
let addHostCount = 0;

function handleSwitchHost(serverId: string): void {
  switchedHosts.push(serverId);
}

function handleReconnect(serverId: string): void {
  reconnectedHosts.push(serverId);
}

function handleAddHost(): void {
  addHostCount += 1;
}

function requireElement(root: ParentNode, testID: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testID}"]`);
  if (element === null) {
    throw new Error(`Expected rendered element: ${testID}`);
  }
  return element;
}

describe("HostSwitcher", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root !== null) React.act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    switchedHosts.length = 0;
    reconnectedHosts.length = 0;
    addHostCount = 0;
    resetBrowserHostRuntimeFixtures();
    vi.unstubAllGlobals();
  });

  it("keeps offline reconnects in place and closes for online switch plus add host", async () => {
    await page.viewport(800, 600);
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setBrowserHostRuntimeFixtures({
      hosts: [
        { serverId: "local", label: "本机 · 我的 Mac" },
        { serverId: "remote", label: "公司 MacBook" },
        { serverId: "offline", label: "旧 Mini" },
      ],
      statuses: { local: "online", remote: "online", offline: "offline" },
    });

    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:240px;height:400px";
    document.body.appendChild(host);
    root = createRoot(host);
    React.act(() =>
      root?.render(
        <HostSwitcher
          activeServerId="local"
          onSwitchHost={handleSwitchHost}
          onReconnect={handleReconnect}
          onAddHost={handleAddHost}
        />,
      ),
    );

    const pill = requireElement(host, "host-switcher-pill");
    React.act(() => pill.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    requireElement(host, "host-switcher-dropdown");

    const offlineRow = requireElement(host, "host-switcher-row-offline");
    React.act(() => offlineRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(reconnectedHosts).toEqual(["offline"]);
    expect(switchedHosts).toEqual([]);
    requireElement(host, "host-switcher-dropdown");

    const onlineRow = requireElement(host, "host-switcher-row-remote");
    React.act(() => onlineRow.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(switchedHosts).toEqual(["remote"]);
    expect(host.querySelector('[data-testid="host-switcher-dropdown"]')).toBeNull();

    React.act(() => pill.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const addHost = requireElement(host, "host-switcher-add");
    React.act(() => addHost.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(addHostCount).toBe(1);
    expect(host.querySelector('[data-testid="host-switcher-dropdown"]')).toBeNull();
  });
});
