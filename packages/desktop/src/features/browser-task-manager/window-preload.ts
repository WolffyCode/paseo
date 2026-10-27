import { ipcRenderer } from "electron";
import {
  TASK_MANAGER_CHANNELS,
  type TaskManagerAppearance,
  type TaskManagerWindowState,
} from "./channels.js";
import type { TaskRow } from "./model.js";
import type { TaskColumnId } from "./table.js";
import { mountTaskManagerView, type TaskManagerBridge } from "./view.js";

// The task manager window's preload: it draws the page itself, so the window loads no code of
// its own and the page reaches the main process only through these calls.
const bridge: TaskManagerBridge = {
  onRows: (handler) => {
    ipcRenderer.on(TASK_MANAGER_CHANNELS.rows, (_event, rows: TaskRow[]) => handler(rows));
  },
  onAppearance: (handler) => {
    ipcRenderer.on(TASK_MANAGER_CHANNELS.appearance, (_event, appearance: TaskManagerAppearance) =>
      handler(appearance),
    );
  },
  onSelect: (handler) => {
    ipcRenderer.on(TASK_MANAGER_CHANNELS.select, (_event, browserId: string | null) =>
      handler(browserId),
    );
  },
  endTasks: (pids) => ipcRenderer.invoke(TASK_MANAGER_CHANNELS.endTasks, pids),
  activate: (browserId) => void ipcRenderer.invoke(TASK_MANAGER_CHANNELS.activate, browserId),
  saveView: (view) => void ipcRenderer.invoke(TASK_MANAGER_CHANNELS.saveView, view),
  showColumnMenu: (visibleColumns): Promise<TaskColumnId | null> =>
    ipcRenderer.invoke(TASK_MANAGER_CHANNELS.columnMenu, visibleColumns),
  close: () => void ipcRenderer.invoke(TASK_MANAGER_CHANNELS.close),
  setMinimumContentSize: (size) =>
    void ipcRenderer.invoke(TASK_MANAGER_CHANNELS.setMinimumContentSize, size),
};

async function mount(): Promise<void> {
  const state: TaskManagerWindowState | null = await ipcRenderer.invoke(
    TASK_MANAGER_CHANNELS.ready,
  );
  if (state) mountTaskManagerView(document, bridge, state);
}

window.addEventListener("DOMContentLoaded", () => void mount());
