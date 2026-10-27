import { z } from "zod";
import { TASK_CATEGORIES, type TaskRow } from "./model.js";
import {
  TASK_COLUMN_IDS,
  DEFAULT_VISIBLE_COLUMNS,
  type TaskManagerColorScheme,
  type TaskManagerStrings,
} from "./table.js";

/** Channels between the task manager window and the main process. */
export const TASK_MANAGER_CHANNELS = {
  ready: "paseo:task-manager:ready",
  rows: "paseo:task-manager:rows",
  appearance: "paseo:task-manager:appearance",
  select: "paseo:task-manager:select",
  endTasks: "paseo:task-manager:end-tasks",
  activate: "paseo:task-manager:activate",
  saveView: "paseo:task-manager:save-view",
  columnMenu: "paseo:task-manager:column-menu",
  close: "paseo:task-manager:close",
  setMinimumContentSize: "paseo:task-manager:set-minimum-content-size",
} as const;

/** The table's state Chrome keeps between openings (Local State task_manager.*). */
const taskManagerViewSchema = z.object({
  category: z.enum(TASK_CATEGORIES),
  visibleColumns: z.array(z.enum(TASK_COLUMN_IDS)).min(1),
  sortKeys: z
    .array(z.object({ columnId: z.enum(TASK_COLUMN_IDS), isAscending: z.boolean() }))
    .max(2),
});
export type TaskManagerView = z.infer<typeof taskManagerViewSchema>;

export function readTaskManagerView(value: unknown): TaskManagerView {
  const result = taskManagerViewSchema.safeParse(value);
  if (!result.success) {
    return {
      category: "tabsAndExtensions",
      visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
      sortKeys: [{ columnId: "cpu", isAscending: false }],
    };
  }
  return { ...result.data, visibleColumns: [...new Set(result.data.visibleColumns)] };
}

/** Helm's mark, which stands where Chrome draws its own logo. */
export interface TaskManagerProductLogo {
  viewBox: string;
  d: string;
}

/** How the window speaks and looks: Helm's UI language and color scheme, set by the opener. */
export interface TaskManagerAppearance {
  strings: TaskManagerStrings;
  colorScheme: TaskManagerColorScheme;
  productLogo: TaskManagerProductLogo;
}

/** What the window loads with. */
export interface TaskManagerWindowState extends TaskManagerAppearance {
  view: TaskManagerView;
  /** The page whose row is selected: the one the task manager was opened from. */
  selectedBrowserId: string | null;
  rows: TaskRow[];
}

export const taskManagerAppearanceSchema = z.object({
  colorScheme: z.enum(["light", "dark"]),
  productLogo: z.object({ viewBox: z.string(), d: z.string() }),
  strings: z.object({
    locale: z.string().refine((locale) => {
      try {
        return Intl.getCanonicalLocales(locale).length === 1;
      } catch {
        return false;
      }
    }),
    title: z.string(),
    categories: z.record(z.enum(TASK_CATEGORIES), z.string()),
    searchPlaceholder: z.string(),
    searchAccessibleName: z.string(),
    clearSearch: z.string(),
    endTask: z.string(),
    endTaskAccessibleName: z.string(),
    tasksEnded: z.string(),
    tasksNotEnded: z.string(),
    columns: z.record(z.enum(TASK_COLUMN_IDS), z.string()),
    titles: z.object({
      browser: z.string(),
      gpu: z.string(),
      renderer: z.string(),
      utility: z.string(),
      tab: z.string(),
      subframe: z.string(),
      extension: z.string(),
      serviceWorker: z.string(),
    }),
    notAvailable: z.string(),
    byteUnits: z.object({
      bytes: z.string(),
      kilobytes: z.string(),
      megabytes: z.string(),
      gigabytes: z.string(),
    }),
    profileName: z.string(),
  }),
}) satisfies z.ZodType<TaskManagerAppearance>;
