import { describe, expect, it } from "vitest";
import type { TaskRow } from "./model.js";
import { readTaskManagerView, taskManagerAppearanceSchema } from "./channels.js";
import {
  formatBytes,
  groupTaskRows,
  sortAfterHeaderClick,
  sortTaskGroups,
  taskCellText,
  visibleTaskGroups,
  type TaskManagerStrings,
} from "./table.js";

const strings: TaskManagerStrings = {
  locale: "en",
  title: "Task Manager",
  categories: { tabsAndExtensions: "Tabs & extensions", browser: "Browser", all: "All tasks" },
  searchPlaceholder: "Search",
  searchAccessibleName: "Search for any process from the list.",
  clearSearch: "Clear search",
  endTask: "End Task",
  endTaskAccessibleName: "Ends the highlighted task.",
  tasksEnded: "Task(s) ended.",
  tasksNotEnded: "Failed to end task(s).",
  columns: {
    task: "Task",
    profile: "Profile",
    memory: "Memory Footprint",
    cpu: "CPU",
    network: "Network",
    processId: "Process ID",
    idleWakeups: "Idle Wake Ups",
  },
  titles: {
    browser: "Browser",
    gpu: "GPU Process",
    renderer: "Renderer",
    utility: "Utility: $1",
    tab: "Tab: $1",
    subframe: "Subframe: $1",
    extension: "Extension: $1",
    serviceWorker: "Service Worker: $1",
  },
  notAvailable: "–",
  byteUnits: { bytes: "$1 B", kilobytes: "$1 KB", megabytes: "$1 MB", gigabytes: "$1 GB" },
  profileName: "Your Helm",
};

function row(overrides: Partial<TaskRow> & Pick<TaskRow, "taskId" | "pid">): TaskRow {
  return {
    title: { kind: "renderer" },
    icon: { kind: "none" },
    category: "tabsAndExtensions",
    isKillable: true,
    browserId: null,
    memoryBytes: 0,
    cpuPercent: 0,
    idleWakeupsPerSecond: 0,
    ...overrides,
  };
}

describe("formatBytes", () => {
  it("picks ui::FormatBytes's unit and keeps one decimal under 100 of it", () => {
    expect(formatBytes(0, strings)).toBe("0 B");
    expect(formatBytes(3071, strings)).toBe("3,071 B");
    expect(formatBytes(3072, strings)).toBe("3.0 KB");
    expect(formatBytes(150 * 1024, strings)).toBe("150 KB");
    expect(formatBytes(2 * 1024 ** 2, strings)).toBe("2.0 MB");
    expect(formatBytes(1.5 * 1024 ** 3, strings)).toBe("1.5 GB");
  });
});

describe("taskCellText", () => {
  it("prints per-process columns on a process's first row only", () => {
    const second = row({ taskId: "tab:b", pid: 4, title: { kind: "tab", name: "B" } });
    expect(
      taskCellText({ columnId: "processId", row: second, isFirstRowOfProcess: false, strings }),
    ).toBe("");
    expect(
      taskCellText({ columnId: "task", row: second, isFirstRowOfProcess: false, strings }),
    ).toBe("Tab: B");
    expect(
      taskCellText({
        columnId: "cpu",
        row: row({ taskId: "x", pid: 1, cpuPercent: null }),
        isFirstRowOfProcess: true,
        strings,
      }),
    ).toBe("–");
  });
});

describe("visibleTaskGroups", () => {
  const groups = groupTaskRows([
    row({ taskId: "browser", pid: 1, title: { kind: "browser" }, category: "browser" }),
    row({ taskId: "tab:a", pid: 4, title: { kind: "tab", name: "Café" } }),
    row({ taskId: "subframe:a", pid: 4, title: { kind: "subframe", name: "https://x.test/" } }),
    row({
      taskId: "sw",
      pid: 9,
      title: { kind: "serviceWorker", name: "sw.js" },
      category: "allOnly",
    }),
  ]);

  it("shows a category's processes, workers only under 所有任务", () => {
    const pidsIn = (category: "tabsAndExtensions" | "browser" | "all") =>
      visibleTaskGroups({ groups, category, query: "", strings }).map((group) => group.pid);
    expect(pidsIn("tabsAndExtensions")).toEqual([4]);
    expect(pidsIn("browser")).toEqual([1]);
    expect(pidsIn("all")).toEqual([1, 4, 9]);
  });

  it("keeps a whole process when one of its titles matches, ignoring case and accents", () => {
    const matches = visibleTaskGroups({ groups, category: "all", query: "CAFE", strings });
    expect(matches).toHaveLength(1);
    expect(matches[0].rows).toHaveLength(2);
  });
});

describe("sorting", () => {
  it("cycles a header through its first direction, the reverse and no sort", () => {
    const first = sortAfterHeaderClick([], "cpu");
    expect(first).toEqual([{ columnId: "cpu", isAscending: false }]);
    const second = sortAfterHeaderClick(first, "cpu");
    expect(second).toEqual([{ columnId: "cpu", isAscending: true }]);
    expect(sortAfterHeaderClick(second, "cpu")).toEqual([]);
  });

  it("keeps the replaced sort as the second key", () => {
    const byTask = sortAfterHeaderClick(sortAfterHeaderClick([], "cpu"), "task");
    expect(byTask).toEqual([
      { columnId: "task", isAscending: true },
      { columnId: "cpu", isAscending: false },
    ]);
  });

  it("orders processes by their first row and falls back to the model order", () => {
    const groups = groupTaskRows([
      row({ taskId: "a", pid: 1, cpuPercent: 1 }),
      row({ taskId: "b", pid: 2, cpuPercent: 5 }),
      row({ taskId: "c", pid: 3, cpuPercent: 1 }),
    ]);
    const sorted = sortTaskGroups(groups, [{ columnId: "cpu", isAscending: false }], strings);
    expect(sorted.map((group) => group.pid)).toEqual([2, 1, 3]);
  });
});

describe("task manager persisted view", () => {
  it("keeps the order of re-enabled columns when reopening the window", () => {
    const view = { category: "all", visibleColumns: ["cpu", "task", "processId"], sortKeys: [] };
    expect(readTaskManagerView(view)).toEqual(view);
  });

  it("restores usable defaults for malformed saved state", () => {
    expect(
      readTaskManagerView({ category: "all", visibleColumns: [], sortKeys: [] }),
    ).toMatchObject({
      category: "tabsAndExtensions",
      visibleColumns: ["task", "memory", "cpu", "network", "processId"],
    });
  });

  it("validates the full appearance at the IPC boundary", () => {
    const appearance = {
      strings,
      colorScheme: "dark",
      productLogo: { viewBox: "0 0 24 24", d: "M0 0" },
    };
    expect(taskManagerAppearanceSchema.safeParse(appearance).success).toBe(true);
    expect(
      taskManagerAppearanceSchema.safeParse({ ...appearance, strings: { ...strings, columns: {} } })
        .success,
    ).toBe(false);
    expect(
      taskManagerAppearanceSchema.safeParse({
        ...appearance,
        strings: { ...strings, locale: "bad_locale!" },
      }).success,
    ).toBe(false);
  });
});
