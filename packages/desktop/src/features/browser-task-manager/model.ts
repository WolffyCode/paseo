/**
 * Chrome's task manager rows (chrome/browser/task_manager) built from what Electron reports: one
 * row per task, rows of one process kept together as a group, each in the category tab Chrome
 * files it under. The window draws these; it localizes titles itself.
 */

/** One process as `app.getAppMetrics()` reports it. */
export interface TaskManagerProcess {
  pid: number;
  /** Electron's ProcessMetric.type: "Browser", "Tab", "GPU", "Utility", … */
  type: string;
  /** A utility process's display name, such as "Network Service". */
  name: string | null;
  cpuPercent: number;
  idleWakeupsPerSecond: number;
  /** ProcessMetric.memory.workingSetSize, in KB. */
  workingSetKb: number;
}

/** A column-3 page: its guest's process, and the frames that run in other processes. */
export interface TaskManagerPage {
  browserId: string;
  pid: number;
  title: string;
  url: string;
  faviconUrl: string | null;
  /** Out-of-process iframes: Chrome's 子框架 rows. */
  subframes: { pid: number; site: string }[];
  /** The page's DevTools, which Chrome lists as a tab of its own. */
  devTools: { pid: number; title: string } | null;
}

export interface TaskManagerExtensionPage {
  pid: number;
  name: string;
  iconUrl: string | null;
}

export interface TaskManagerServiceWorker {
  pid: number;
  scriptUrl: string;
}

/** What one refresh knows about the processes. */
export interface TaskManagerSample {
  browserPid: number;
  processes: TaskManagerProcess[];
  pages: TaskManagerPage[];
  extensionPages: TaskManagerExtensionPage[];
  serviceWorkers: TaskManagerServiceWorker[];
  /**
   * Helm's own window renderers. Chrome draws its UI in the browser process, which has its one
   * row; these processes have no counterpart there, and ending one would blank a Helm window.
   */
  appRendererPids: ReadonlySet<number>;
  /** The first sample after opening: Chrome has no CPU figure yet and prints –. */
  isFirstSample: boolean;
}

/** The category tabs (TaskManagerView's kTabsAndExtensions, kSystem, kAll). */
export const TASK_CATEGORIES = ["tabsAndExtensions", "browser", "all"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/** Which tab lists a row besides 所有任务; workers are listed only there. */
export type TaskRowCategory = Exclude<TaskCategory, "all"> | "allOnly";

/** A row's title before localization: the template it uses and the name it fills in. */
export type TaskTitle =
  | { kind: "browser" }
  | { kind: "gpu" }
  | { kind: "renderer" }
  | { kind: "utility"; name: string }
  | { kind: "tab"; name: string }
  | { kind: "subframe"; name: string }
  | { kind: "extension"; name: string }
  | { kind: "serviceWorker"; name: string };

export type TaskIcon =
  | { kind: "favicon"; url: string }
  | { kind: "product" }
  | { kind: "puzzle" }
  | { kind: "none" };

export interface TaskRow {
  /** Stable across refreshes, so selection and hover survive them. */
  taskId: string;
  pid: number;
  title: TaskTitle;
  icon: TaskIcon;
  category: TaskRowCategory;
  /** Chrome ends any process but the browser's. */
  isKillable: boolean;
  /** The column-3 page that double-click and Return bring forward. */
  browserId: string | null;
  memoryBytes: number;
  /** Null before the second sample, as Chrome's NaN. */
  cpuPercent: number | null;
  idleWakeupsPerSecond: number;
}

const KB = 1024;

/**
 * The rows Chrome would show for `sample`, in Chrome's model order: the browser, GPU and utility
 * processes, then each page followed by its subframes and DevTools, extension pages, renderers no
 * page claims, and service workers. Rows of one process are moved next to the process's first
 * row, as TaskManagerImpl keeps each process's tasks together.
 */
export function buildTaskRows(sample: TaskManagerSample): TaskRow[] {
  const processByPid = new Map(sample.processes.map((process) => [process.pid, process]));
  const rows: TaskRow[] = [];
  const claimedPids = new Set<number>([sample.browserPid, ...sample.appRendererPids]);

  const addRow = (row: Omit<TaskRow, "memoryBytes" | "cpuPercent" | "idleWakeupsPerSecond">) => {
    const process = processByPid.get(row.pid);
    if (!process) return;
    claimedPids.add(row.pid);
    rows.push({
      ...row,
      isKillable:
        row.isKillable &&
        row.pid > 1 &&
        row.pid !== sample.browserPid &&
        !sample.appRendererPids.has(row.pid),
      memoryBytes: process.workingSetKb * KB,
      cpuPercent: sample.isFirstSample ? null : process.cpuPercent,
      idleWakeupsPerSecond: process.idleWakeupsPerSecond,
    });
  };

  addRow({
    taskId: "browser",
    pid: sample.browserPid,
    title: { kind: "browser" },
    icon: { kind: "product" },
    category: "browser",
    isKillable: false,
    browserId: null,
  });
  for (const process of sample.processes) {
    if (process.type === "GPU") {
      addRow({
        taskId: `gpu:${process.pid}`,
        pid: process.pid,
        title: { kind: "gpu" },
        icon: { kind: "puzzle" },
        category: "browser",
        isKillable: true,
        browserId: null,
      });
    }
  }
  for (const process of sample.processes) {
    if (process.type === "Utility") {
      addRow({
        taskId: `utility:${process.pid}`,
        pid: process.pid,
        title: { kind: "utility", name: process.name ?? process.type },
        icon: { kind: "puzzle" },
        category: "browser",
        isKillable: true,
        browserId: null,
      });
    }
  }
  for (const page of sample.pages) {
    addPageRows(page, addRow);
  }
  for (const extensionPage of sample.extensionPages) {
    addRow({
      taskId: `extension:${extensionPage.pid}:${extensionPage.name}`,
      pid: extensionPage.pid,
      title: { kind: "extension", name: extensionPage.name },
      icon: extensionPage.iconUrl
        ? { kind: "favicon", url: extensionPage.iconUrl }
        : { kind: "puzzle" },
      category: "tabsAndExtensions",
      isKillable: true,
      browserId: null,
    });
  }
  // A renderer no page claims: Chrome's spare renderer or one it can't place, both 渲染程序.
  for (const process of sample.processes) {
    if (process.type === "Tab" && !claimedPids.has(process.pid)) {
      addRow({
        taskId: `renderer:${process.pid}`,
        pid: process.pid,
        title: { kind: "renderer" },
        icon: { kind: "puzzle" },
        category: "browser",
        isKillable: true,
        browserId: null,
      });
    }
  }
  for (const worker of sample.serviceWorkers) {
    addRow({
      taskId: `serviceWorker:${worker.pid}:${worker.scriptUrl}`,
      pid: worker.pid,
      title: { kind: "serviceWorker", name: worker.scriptUrl },
      icon: { kind: "none" },
      category: "allOnly",
      isKillable: true,
      browserId: null,
    });
  }
  return keepProcessesTogether(rows);
}

function addPageRows(
  page: TaskManagerPage,
  addRow: (row: Omit<TaskRow, "memoryBytes" | "cpuPercent" | "idleWakeupsPerSecond">) => void,
): void {
  // TabContentsTask: the page's title, or its address when it has none.
  const name = page.title.trim() === "" ? page.url : page.title;
  addRow({
    taskId: `tab:${page.browserId}`,
    pid: page.pid,
    title: { kind: "tab", name },
    icon: page.faviconUrl ? { kind: "favicon", url: page.faviconUrl } : { kind: "none" },
    category: "tabsAndExtensions",
    isKillable: true,
    browserId: page.browserId,
  });
  for (const subframe of page.subframes) {
    addRow({
      taskId: `subframe:${page.browserId}:${subframe.pid}:${subframe.site}`,
      pid: subframe.pid,
      title: { kind: "subframe", name: subframe.site },
      icon: { kind: "none" },
      category: "tabsAndExtensions",
      isKillable: true,
      browserId: page.browserId,
    });
  }
  if (page.devTools) {
    addRow({
      taskId: `devtools:${page.browserId}`,
      pid: page.devTools.pid,
      title: { kind: "tab", name: page.devTools.title },
      icon: { kind: "none" },
      category: "tabsAndExtensions",
      isKillable: true,
      browserId: page.browserId,
    });
  }
}

function keepProcessesTogether(rows: TaskRow[]): TaskRow[] {
  const rowsByPid = new Map<number, TaskRow[]>();
  for (const row of rows) {
    const processRows = rowsByPid.get(row.pid);
    if (processRows) {
      processRows.push(row);
    } else {
      rowsByPid.set(row.pid, [row]);
    }
  }
  return [...rowsByPid.values()].flat();
}

/**
 * A subframe row's name: its origin as scheme://host/. Chrome prints the site, the registrable
 * domain without subdomains, which needs the public suffix list Electron doesn't expose.
 */
export function subframeSite(origin: string): string {
  try {
    const url = new URL(origin);
    return `${url.protocol}//${url.host}/`;
  } catch {
    // An opaque origin ("null") names no site; Chrome prints what it has.
    return origin;
  }
}

/** Resolve the selection against a fresh sample before sending signals; stale or foreign PIDs
 * must never turn a task-manager action into an arbitrary process kill. */
export function taskProcessIdsToEnd(request: unknown, sample: TaskManagerSample): number[] | null {
  if (!Array.isArray(request) || request.length === 0) return null;
  const rows = buildTaskRows(sample);
  const killablePids = new Set(rows.filter((row) => row.isKillable).map((row) => row.pid));
  const selected = new Set<number>();
  for (const pid of request) {
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || !killablePids.has(pid))
      return null;
    selected.add(pid);
  }
  return [...selected];
}
