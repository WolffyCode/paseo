import { describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  describeUsageProblem,
  displayPercent,
  formatUsageFreshness,
  resolveAgentUsageView,
  replaceReport,
  resolveUsageRefresh,
  resolveUsageHostId,
  resolveUsageModalHostId,
  resolveUsageView,
  settleReports,
  upsertReport,
  usageWindowRowLabel,
  type UsageHost,
  type UsageQueryState,
} from "./model";
import type { UsageReportEntry, UsageWindow } from "./types";

const englishT = i18n.getFixedT("en");

function entry(input: {
  windows?: UsageWindow[];
  planLabel?: string;
  icon?: string;
  sourceId?: string;
}): UsageReportEntry {
  return {
    id: `${input.sourceId ?? "fixture"}:account-1`,
    account: {},
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceId: input.sourceId ?? "fixture",
    sourceLabel: "Fixture source",
    ...(input.icon ? { icon: input.icon } : {}),
    report: {
      status: "available",
      ...(input.planLabel ? { planLabel: input.planLabel } : {}),
      windows: input.windows ?? [],
    },
  };
}

function ready(data: UsageReportEntry[]): UsageQueryState {
  return { data, error: null, isFetching: false };
}

describe("resolveUsageView", () => {
  it("asks for a host update when the host lacks usage sources", () => {
    expect(
      resolveUsageView({
        hostLabel: "Laptop",
        isConnected: true,
        supportsUsage: false,
        query: ready([entry({})]),
        t: englishT,
      }),
    ).toEqual({ kind: "unavailable", message: "Update Laptop to see usage" });
  });

  it("asks for a connection before anything else", () => {
    expect(
      resolveUsageView({
        hostLabel: "Laptop",
        isConnected: false,
        supportsUsage: false,
        query: undefined,
        t: englishT,
      }),
    ).toEqual({ kind: "unavailable", message: "Connect to Laptop to see usage" });
  });

  it("moves from loading to ready to error", () => {
    const base = { hostLabel: "Laptop", isConnected: true, supportsUsage: true, t: englishT };
    expect(resolveUsageView({ ...base, query: undefined })).toEqual({ kind: "loading" });
    expect(
      resolveUsageView({ ...base, query: { data: [], error: null, isFetching: true } }),
    ).toEqual({ kind: "ready", reports: [], isRefreshing: true });
    expect(
      resolveUsageView({
        ...base,
        query: { data: undefined, error: new Error("boom"), isFetching: false },
      }),
    ).toEqual({ kind: "error", message: "boom" });
  });
});

const hosts: UsageHost[] = [
  { serverId: "offline", label: "Offline", isConnected: false, supportsUsage: true },
  { serverId: "old", label: "Old", isConnected: true, supportsUsage: false },
  { serverId: "a", label: "Alpha", isConnected: true, supportsUsage: true },
  { serverId: "b", label: "Beta", isConnected: true, supportsUsage: true },
];

describe("resolveUsageHostId", () => {
  const choose = (pickedServerId: string | null, activeServerId: string | null) =>
    resolveUsageHostId({ pickedServerId, activeServerId, hosts });

  it("reads the picked host over the active workspace's host", () => {
    expect(choose("a", "b")).toBe("a");
  });

  it("reads the active workspace's host when nothing usable is picked", () => {
    expect(choose(null, "b")).toBe("b");
    expect(choose("offline", "b")).toBe("b");
    expect(choose("old", "b")).toBe("b");
  });

  it("falls back to the first connected host that reports usage", () => {
    expect(choose(null, null)).toBe("a");
    expect(choose(null, "offline")).toBe("a");
    expect(choose(null, "old")).toBe("a");
  });

  it("has no host when none reports usage", () => {
    expect(
      resolveUsageHostId({
        pickedServerId: "old",
        activeServerId: "old",
        hosts: hosts.slice(0, 2),
      }),
    ).toBeNull();
  });
});

describe("resolveUsageModalHostId", () => {
  it("shows the picked host while it stays connected, even one that cannot report usage", () => {
    expect(resolveUsageModalHostId({ pickedServerId: "old", activeServerId: "b", hosts })).toBe(
      "old",
    );
    expect(resolveUsageModalHostId({ pickedServerId: "offline", activeServerId: "b", hosts })).toBe(
      "b",
    );
  });

  it("otherwise shows the host the sidebar row reads", () => {
    for (const pickedServerId of [null, "a", "offline"]) {
      for (const activeServerId of ["b", null, "old", "offline"]) {
        const choice = { pickedServerId, activeServerId, hosts };
        expect(resolveUsageModalHostId(choice)).toBe(resolveUsageHostId(choice));
      }
    }
  });

  it("shows the first connected host when none reports usage, so the modal says to update it", () => {
    expect(
      resolveUsageModalHostId({
        pickedServerId: null,
        activeServerId: null,
        hosts: hosts.slice(0, 2),
      }),
    ).toBe("old");
    expect(
      resolveUsageModalHostId({ pickedServerId: null, activeServerId: null, hosts: [] }),
    ).toBeNull();
  });
});

describe("usageWindowRowLabel", () => {
  it("names the window, its percent and its reset after what pinning it pins", () => {
    expect(
      usageWindowRowLabel({
        pinLabel: "Pin Claude Session",
        value: "31%",
        trailing: "resets in 2h",
      }),
    ).toBe("Pin Claude Session, 31% · resets in 2h");
    expect(usageWindowRowLabel({ pinLabel: "Pin Codex Weekly", value: "—", trailing: null })).toBe(
      "Pin Codex Weekly, —",
    );
  });
});

describe("displayPercent", () => {
  const window = (input: Partial<UsageWindow>): UsageWindow => ({
    id: "weekly",
    label: "Weekly",
    ...input,
  });

  it("reads the share used or the share left", () => {
    expect(displayPercent(window({ usedPct: 31 }), "used")).toBe(31);
    expect(displayPercent(window({ usedPct: 31 }), "remaining")).toBe(69);
    expect(displayPercent(window({ remainingPct: 40 }), "used")).toBe(60);
    expect(displayPercent(window({ usedPct: 50, remainingPct: 45 }), "remaining")).toBe(45);
  });

  it("has no percent when the window reports none", () => {
    expect(displayPercent(window({}), "remaining")).toBeNull();
  });
});

describe("formatUsageFreshness", () => {
  it("says when the report was fetched", () => {
    expect(formatUsageFreshness("just now", englishT)).toBe("Updated just now");
    expect(formatUsageFreshness("3m ago", englishT)).toBe("Updated 3m ago");
    expect(formatUsageFreshness("Jan 15", englishT)).toBe("Updated Jan 15");
  });
});

describe("describeUsageProblem", () => {
  it.each([
    [
      { kind: "expired", expiresAt: "2026-10-01T09:00:00Z", refreshedBy: "claude" },
      "Login expired 3h ago. Run claude to refresh it.",
    ],
    [
      { kind: "expired", expiresAt: "2026-10-01T09:00:00Z" },
      "Login expired 3h ago. Sign in again.",
    ],
    [
      { kind: "rejected", status: 403, refreshedBy: "codex" },
      "Login rejected (HTTP 403). Run codex to refresh it.",
    ],
    [{ kind: "rejected", status: 401 }, "Login rejected (HTTP 401). Sign in again."],
    [{ kind: "no_quota", detail: "No active coding plan" }, "No active coding plan"],
  ] as const)("words %j", (problem, sentence) => {
    expect(describeUsageProblem(problem, englishT, "en", new Date("2026-10-01T12:00:00Z"))).toBe(
      sentence,
    );
  });
});

describe("resolveUsageRefresh", () => {
  it("is pending while a refresh runs, even after an earlier failure", () => {
    expect(resolveUsageRefresh({ isPending: true, error: new Error("boom") })).toBe("pending");
  });

  it("is failed after a refresh errors", () => {
    expect(resolveUsageRefresh({ isPending: false, error: new Error("boom") })).toBe("failed");
  });

  it("is idle before and after a successful refresh", () => {
    expect(resolveUsageRefresh({ isPending: false, error: null })).toBe("idle");
  });
});

describe("replaceReport", () => {
  const alpha = entry({ sourceId: "alpha", planLabel: "Old" });
  const beta = entry({ sourceId: "beta" });

  it("swaps only the refreshed report, in place", () => {
    const refreshed = entry({ sourceId: "alpha", planLabel: "New" });
    expect(replaceReport([alpha, beta], alpha.id, refreshed)).toEqual([refreshed, beta]);
  });

  it("drops a report the daemon no longer knows", () => {
    expect(replaceReport([alpha, beta], alpha.id, null)).toEqual([beta]);
  });
});

describe("upsertReport", () => {
  const alpha = entry({ sourceId: "alpha", planLabel: "Old" });
  const beta = entry({ sourceId: "beta" });

  it("starts a list from the first streamed report", () => {
    expect(upsertReport(undefined, alpha)).toEqual([alpha]);
  });

  it("appends a report the list does not have yet", () => {
    expect(upsertReport([alpha], beta)).toEqual([alpha, beta]);
  });

  it("replaces a report the list already has, in place", () => {
    const streamed = entry({ sourceId: "alpha", planLabel: "New" });
    expect(upsertReport([alpha, beta], streamed)).toEqual([streamed, beta]);
  });

  it("keeps a copy fetched after the streamed one, such as a Refresh that landed first", () => {
    const refreshed = { ...alpha, planLabel: "Refreshed", fetchedAt: "2026-01-01T00:05:00.000Z" };
    expect(upsertReport([refreshed, beta], alpha)).toEqual([refreshed, beta]);
  });
});

describe("settleReports", () => {
  const alpha = entry({ sourceId: "alpha", planLabel: "Old" });
  const beta = entry({ sourceId: "beta" });

  it("takes the finished list, dropping reports the host no longer has", () => {
    const streamed = entry({ sourceId: "alpha", planLabel: "New" });
    expect(settleReports([alpha, beta], [streamed])).toEqual([streamed]);
  });

  it("keeps a report refreshed while the list streamed over its older copy in the list", () => {
    const refreshed = { ...alpha, planLabel: "Refreshed", fetchedAt: "2026-01-01T00:05:00.000Z" };
    expect(settleReports([refreshed, beta], [alpha, beta])).toEqual([refreshed, beta]);
  });

  it("takes the finished list as is when nothing was shown yet", () => {
    expect(settleReports(undefined, [alpha, beta])).toEqual([alpha, beta]);
  });
});

describe("resolveAgentUsageView", () => {
  const report = entry({ sourceId: "claude" });
  const idle: UsageQueryState = { data: undefined, error: null, isFetching: false };
  const t = englishT;

  it("shows nothing on a host that cannot report usage", () => {
    expect(resolveAgentUsageView({ canReport: false, query: idle, t })).toEqual({ kind: "none" });
  });

  it("loads until the first report streams in", () => {
    expect(
      resolveAgentUsageView({ canReport: true, query: { ...idle, isFetching: true }, t }),
    ).toEqual({ kind: "loading" });
  });

  it("shows each report as it streams in, before the request finishes", () => {
    expect(
      resolveAgentUsageView({
        canReport: true,
        query: { data: [report], error: null, isFetching: true },
        t,
      }),
    ).toEqual({ kind: "ready", reports: [report] });
  });

  it("shows nothing for an agent with no account to report", () => {
    expect(resolveAgentUsageView({ canReport: true, query: { ...idle, data: [] }, t })).toEqual({
      kind: "none",
    });
  });

  it("says why a failed request has nothing to show", () => {
    expect(
      resolveAgentUsageView({
        canReport: true,
        query: { ...idle, error: new Error("Unknown agent") },
        t,
      }),
    ).toEqual({ kind: "error", message: "Unable to load usage: Unknown agent" });
  });

  it("says the request failed instead of showing the reports from before it", () => {
    expect(
      resolveAgentUsageView({
        canReport: true,
        query: { data: [report], error: new Error("Unknown agent"), isFetching: false },
        t,
      }),
    ).toEqual({ kind: "error", message: "Unable to load usage: Unknown agent" });
  });
});
