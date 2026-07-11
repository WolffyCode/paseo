export type HostRuntimeConnectionStatus = "idle" | "connecting" | "online" | "offline" | "error";

export interface BrowserHostFixture {
  readonly serverId: string;
  readonly label: string;
}

let hosts: readonly BrowserHostFixture[] = [];
let statuses: Readonly<Record<string, HostRuntimeConnectionStatus>> = {};

export function setBrowserHostRuntimeFixtures(input: {
  readonly hosts: readonly BrowserHostFixture[];
  readonly statuses: Readonly<Record<string, HostRuntimeConnectionStatus>>;
}): void {
  hosts = input.hosts;
  statuses = input.statuses;
}

export function resetBrowserHostRuntimeFixtures(): void {
  hosts = [];
  statuses = {};
}

export function useHosts(): readonly BrowserHostFixture[] {
  return hosts;
}

export function useHostRuntimeConnectionStatus(serverId: string): HostRuntimeConnectionStatus {
  return statuses[serverId] ?? "connecting";
}
