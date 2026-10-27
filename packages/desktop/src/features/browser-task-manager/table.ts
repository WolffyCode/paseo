import type { TaskCategory, TaskRow, TaskTitle } from "./model.js";

/** Everything the window shows in words, in Helm's UI language; sent by the window that opens it. */
export interface TaskManagerStrings {
  locale: string;
  title: string;
  categories: Record<TaskCategory, string>;
  searchPlaceholder: string;
  searchAccessibleName: string;
  clearSearch: string;
  endTask: string;
  endTaskAccessibleName: string;
  tasksEnded: string;
  tasksNotEnded: string;
  columns: Record<TaskColumnId, string>;
  /** Row title templates; `$1` is the name filled in. */
  titles: Record<TaskTitle["kind"], string>;
  notAvailable: string;
  /** ui::FormatBytes's unit templates. */
  byteUnits: { bytes: string; kilobytes: string; megabytes: string; gigabytes: string };
  profileName: string;
}

export type TaskManagerColorScheme = "light" | "dark";

export const TASK_COLUMN_IDS = [
  "task",
  "profile",
  "memory",
  "cpu",
  "network",
  "processId",
  "idleWakeups",
] as const;
export type TaskColumnId = (typeof TASK_COLUMN_IDS)[number];

/** Chrome's columns visible in a fresh profile (task_manager_columns.h). */
export const DEFAULT_VISIBLE_COLUMNS: readonly TaskColumnId[] = [
  "task",
  "memory",
  "cpu",
  "network",
  "processId",
];

interface TaskColumn {
  id: TaskColumnId;
  isRightAligned: boolean;
  /** The direction a first click on the header sorts in. */
  isFirstSortAscending: boolean;
  /** A per-process value: printed only on a process's first row. */
  isPerProcess: boolean;
}

export const TASK_COLUMNS: Record<TaskColumnId, TaskColumn> = {
  task: { id: "task", isRightAligned: false, isFirstSortAscending: true, isPerProcess: false },
  profile: {
    id: "profile",
    isRightAligned: false,
    isFirstSortAscending: true,
    isPerProcess: false,
  },
  memory: { id: "memory", isRightAligned: true, isFirstSortAscending: false, isPerProcess: true },
  cpu: { id: "cpu", isRightAligned: true, isFirstSortAscending: false, isPerProcess: true },
  network: { id: "network", isRightAligned: true, isFirstSortAscending: false, isPerProcess: true },
  processId: {
    id: "processId",
    isRightAligned: true,
    isFirstSortAscending: true,
    isPerProcess: true,
  },
  idleWakeups: {
    id: "idleWakeups",
    isRightAligned: true,
    isFirstSortAscending: false,
    isPerProcess: true,
  },
};

export interface TaskSortKey {
  columnId: TaskColumnId;
  isAscending: boolean;
}

/** A process and its rows: what the table selects, hovers and sorts as one. */
export interface TaskGroup {
  pid: number;
  rows: TaskRow[];
}

const TITLE_NAME_PLACEHOLDER = "$1";

/** A row's title in the UI language, as the Task column and the search see it. */
export function taskTitleText(title: TaskTitle, strings: TaskManagerStrings): string {
  const template = strings.titles[title.kind];
  if (!("name" in title)) {
    return template;
  }
  return template.replace(TITLE_NAME_PLACEHOLDER, title.name);
}

const BYTE_UNIT_THRESHOLDS = [
  { unit: "gigabytes", minimum: 1024 ** 3, divisor: 1024 ** 3 },
  { unit: "megabytes", minimum: 2 * 1024 ** 2, divisor: 1024 ** 2 },
  { unit: "kilobytes", minimum: 3 * 1024, divisor: 1024 },
] as const;
// A value under 100 in its unit keeps one decimal (ui/base/text/bytes_formatting.cc).
const ONE_DECIMAL_BELOW = 100;

/** ui::FormatBytes: the largest unit the size reaches, one decimal under 100 of it. */
export function formatBytes(bytes: number, strings: TaskManagerStrings): string {
  const scale = BYTE_UNIT_THRESHOLDS.find((threshold) => bytes >= threshold.minimum);
  if (!scale) {
    return strings.byteUnits.bytes.replace(
      TITLE_NAME_PLACEHOLDER,
      new Intl.NumberFormat(strings.locale, { maximumFractionDigits: 0 }).format(bytes),
    );
  }
  const amount = bytes / scale.divisor;
  const fractionDigits = amount < ONE_DECIMAL_BELOW ? 1 : 0;
  const number = new Intl.NumberFormat(strings.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
  return strings.byteUnits[scale.unit].replace(TITLE_NAME_PLACEHOLDER, number);
}

/** One cell's text: per-process columns only on the first row of their process. */
export function taskCellText(input: {
  columnId: TaskColumnId;
  row: TaskRow;
  isFirstRowOfProcess: boolean;
  strings: TaskManagerStrings;
}): string {
  const { columnId, row, strings } = input;
  if (TASK_COLUMNS[columnId].isPerProcess && !input.isFirstRowOfProcess) {
    return "";
  }
  switch (columnId) {
    case "task":
      return taskTitleText(row.title, strings);
    case "profile":
      // The browser's own processes belong to no profile.
      return row.category === "browser" ? "" : strings.profileName;
    case "memory":
      return formatBytes(row.memoryBytes, strings);
    case "cpu":
      return row.cpuPercent === null
        ? strings.notAvailable
        : new Intl.NumberFormat(strings.locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }).format(row.cpuPercent);
    case "network":
      // Electron counts no bytes per process.
      return strings.notAvailable;
    case "processId":
      return String(row.pid);
    case "idleWakeups":
      return String(Math.round(row.idleWakeupsPerSecond));
  }
}

/** Rows grouped by process, in the order the processes first appear. */
export function groupTaskRows(rows: readonly TaskRow[]): TaskGroup[] {
  const groups = new Map<number, TaskGroup>();
  for (const row of rows) {
    const group = groups.get(row.pid);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(row.pid, { pid: row.pid, rows: [row] });
    }
  }
  return [...groups.values()];
}

function isInCategory(row: TaskRow, category: TaskCategory): boolean {
  if (category === "all") return true;
  return row.category === category;
}

/** Folds case and accents, as Chrome's search compares. */
function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/**
 * The processes a category and search show: one with a row of the category whose title contains
 * the query keeps all its rows, as TaskManagerTableModel filters by process.
 */
export function visibleTaskGroups(input: {
  groups: readonly TaskGroup[];
  category: TaskCategory;
  query: string;
  strings: TaskManagerStrings;
}): TaskGroup[] {
  const query = searchKey(input.query.trim());
  return input.groups.filter((group) =>
    group.rows.some((row) => {
      if (!isInCategory(row, input.category)) return false;
      if (query === "") return true;
      return searchKey(taskTitleText(row.title, input.strings)).includes(query);
    }),
  );
}

function compareGroups(
  first: TaskGroup,
  second: TaskGroup,
  key: TaskSortKey,
  strings: TaskManagerStrings,
  collator: Intl.Collator,
): number {
  const firstRow = first.rows[0];
  const secondRow = second.rows[0];
  let order = 0;
  switch (key.columnId) {
    case "task":
      order = collator.compare(
        taskTitleText(firstRow.title, strings),
        taskTitleText(secondRow.title, strings),
      );
      break;
    case "profile":
      order = 0;
      break;
    case "memory":
      order = firstRow.memoryBytes - secondRow.memoryBytes;
      break;
    case "cpu":
      order = (firstRow.cpuPercent ?? -1) - (secondRow.cpuPercent ?? -1);
      break;
    case "network":
      order = 0;
      break;
    case "processId":
      order = first.pid - second.pid;
      break;
    case "idleWakeups":
      order = firstRow.idleWakeupsPerSecond - secondRow.idleWakeupsPerSecond;
      break;
  }
  return key.isAscending ? order : -order;
}

/** Processes in the table's sort order; unsorted keeps the model order. */
export function sortTaskGroups(
  groups: readonly TaskGroup[],
  sortKeys: readonly TaskSortKey[],
  strings: TaskManagerStrings,
): TaskGroup[] {
  const collator = new Intl.Collator(strings.locale);
  const modelOrder = new Map(groups.map((group, index) => [group.pid, index]));
  return [...groups].sort((first, second) => {
    for (const key of sortKeys) {
      const order = compareGroups(first, second, key, strings, collator);
      if (order !== 0) return order;
    }
    return (modelOrder.get(first.pid) ?? 0) - (modelOrder.get(second.pid) ?? 0);
  });
}

// TableView keeps the previous primary sort as the secondary key, never more than two.
const MAX_SORT_KEYS = 2;

/**
 * The sort after clicking `columnId`'s header (TableView::ToggleSortOrder): its first direction,
 * then the reverse, then no sort by it; the column it replaces stays as the second key.
 */
export function sortAfterHeaderClick(
  sortKeys: readonly TaskSortKey[],
  columnId: TaskColumnId,
): TaskSortKey[] {
  const primary = sortKeys[0];
  const others = sortKeys.filter((key) => key.columnId !== columnId);
  const firstDirection = TASK_COLUMNS[columnId].isFirstSortAscending;
  if (primary?.columnId !== columnId) {
    return [{ columnId, isAscending: firstDirection }, ...others].slice(0, MAX_SORT_KEYS);
  }
  if (primary.isAscending === firstDirection) {
    return [{ columnId, isAscending: !firstDirection }, ...others].slice(0, MAX_SORT_KEYS);
  }
  return others;
}
