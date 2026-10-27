import { describe, expect, it } from "vitest";
import {
  buildTaskRows,
  subframeSite,
  taskProcessIdsToEnd,
  type TaskManagerSample,
} from "./model.js";

function sample(overrides: Partial<TaskManagerSample> = {}): TaskManagerSample {
  return {
    browserPid: 1,
    processes: [
      {
        pid: 1,
        type: "Browser",
        name: null,
        cpuPercent: 2,
        idleWakeupsPerSecond: 3,
        workingSetKb: 100,
      },
      { pid: 2, type: "GPU", name: null, cpuPercent: 1, idleWakeupsPerSecond: 0, workingSetKb: 50 },
      {
        pid: 3,
        type: "Utility",
        name: "Network Service",
        cpuPercent: 0,
        idleWakeupsPerSecond: 0,
        workingSetKb: 20,
      },
      {
        pid: 4,
        type: "Tab",
        name: null,
        cpuPercent: 5,
        idleWakeupsPerSecond: 1,
        workingSetKb: 300,
      },
      { pid: 5, type: "Tab", name: null, cpuPercent: 0, idleWakeupsPerSecond: 0, workingSetKb: 40 },
      { pid: 6, type: "Tab", name: null, cpuPercent: 0, idleWakeupsPerSecond: 0, workingSetKb: 30 },
      { pid: 7, type: "Tab", name: null, cpuPercent: 0, idleWakeupsPerSecond: 0, workingSetKb: 10 },
    ],
    pages: [
      {
        browserId: "a",
        pid: 4,
        title: "GitHub",
        url: "https://github.com/",
        faviconUrl: "https://github.com/favicon.ico",
        subframes: [{ pid: 5, site: "https://youtube.com/" }],
        devTools: null,
      },
    ],
    extensionPages: [],
    serviceWorkers: [],
    appRendererPids: new Set([6]),
    isFirstSample: false,
    ...overrides,
  };
}

describe("buildTaskRows", () => {
  it("lists Chrome's rows in its model order and leaves Helm's own window renderers out", () => {
    const rows = buildTaskRows(sample());
    expect(rows.map((row) => row.taskId)).toEqual([
      "browser",
      "gpu:2",
      "utility:3",
      "tab:a",
      "subframe:a:5:https://youtube.com/",
      "renderer:7",
    ]);
    expect(rows.find((row) => row.taskId === "browser")).toMatchObject({
      isKillable: false,
      category: "browser",
    });
    expect(rows.find((row) => row.taskId === "tab:a")).toMatchObject({
      title: { kind: "tab", name: "GitHub" },
      browserId: "a",
      memoryBytes: 300 * 1024,
      cpuPercent: 5,
    });
  });

  it("keeps a process's rows together and names an untitled page by its address", () => {
    const rows = buildTaskRows(
      sample({
        pages: [
          {
            browserId: "a",
            pid: 4,
            title: "A",
            url: "https://a.test/",
            faviconUrl: null,
            subframes: [],
            devTools: null,
          },
          {
            browserId: "b",
            pid: 7,
            title: "",
            url: "https://b.test/",
            faviconUrl: null,
            subframes: [],
            devTools: null,
          },
          {
            browserId: "c",
            pid: 4,
            title: "C",
            url: "https://c.test/",
            faviconUrl: null,
            subframes: [],
            devTools: null,
          },
        ],
      }),
    );
    const pageRows = rows.filter((row) => row.title.kind === "tab");
    expect(pageRows.map((row) => row.taskId)).toEqual(["tab:a", "tab:c", "tab:b"]);
    expect(pageRows[2].title).toEqual({ kind: "tab", name: "https://b.test/" });
  });

  it("has no CPU figure on the first sample", () => {
    const rows = buildTaskRows(sample({ isFirstSample: true }));
    expect(rows.every((row) => row.cpuPercent === null)).toBe(true);
  });

  it("lists service workers for 所有任务 only", () => {
    const rows = buildTaskRows(
      sample({ serviceWorkers: [{ pid: 4, scriptUrl: "https://github.com/sw.js" }] }),
    );
    const worker = rows.find((row) => row.title.kind === "serviceWorker");
    expect(worker).toMatchObject({ category: "allOnly", pid: 4 });
    // It joins its process's rows.
    expect(rows.indexOf(worker!)).toBe(rows.findIndex((row) => row.taskId === "tab:a") + 1);
  });
});

describe("subframeSite", () => {
  it("prints an origin as scheme://host/", () => {
    expect(subframeSite("https://www.youtube.com")).toBe("https://www.youtube.com/");
    expect(subframeSite("null")).toBe("null");
  });
});

describe("ending task processes", () => {
  it("resolves a selection against current browser tasks and deduplicates shared processes", () => {
    expect(taskProcessIdsToEnd([4, 4, 5], sample())).toEqual([4, 5]);
  });

  it.each([[0], [-1], [1], [6], [99999], [4.5], ["4"], [4, 99999], []])(
    "rejects stale, protected, malformed or foreign process selections: %j",
    (...pids) => {
      expect(taskProcessIdsToEnd(pids, sample())).toBeNull();
    },
  );

  it("disables page rows that share a protected Helm renderer", () => {
    const current = sample({ appRendererPids: new Set([4, 6]) });
    expect(buildTaskRows(current).find((row) => row.taskId === "tab:a")?.isKillable).toBe(false);
    expect(taskProcessIdsToEnd([4], current)).toBeNull();
  });
});
