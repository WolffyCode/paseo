import { BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from "electron";

/** One row of a menu the renderer asks the main process to show as a native menu. */
export interface NativeMenuItem {
  id?: string;
  label?: string;
  kind?: "item" | "separator" | "checkbox";
  isEnabled?: boolean;
  isChecked?: boolean;
  /** A shortcut shown beside the label (Electron accelerator syntax); the menu doesn't bind it. */
  accelerator?: string;
  submenu?: NativeMenuItem[];
}

interface NativeMenuPopupInput {
  items: NativeMenuItem[];
  x?: number;
  y?: number;
}

const NATIVE_MENU_KINDS = new Set(["item", "separator", "checkbox"]);

function readNativeMenuItem(input: unknown): NativeMenuItem | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (record.kind !== undefined && !NATIVE_MENU_KINDS.has(record.kind as string)) {
    return null;
  }
  const submenu = record.submenu === undefined ? undefined : readNativeMenuItems(record.submenu);
  if (submenu === null) {
    return null;
  }
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    label: typeof record.label === "string" ? record.label : undefined,
    kind: record.kind as NativeMenuItem["kind"],
    isEnabled: typeof record.isEnabled === "boolean" ? record.isEnabled : undefined,
    isChecked: typeof record.isChecked === "boolean" ? record.isChecked : undefined,
    accelerator: typeof record.accelerator === "string" ? record.accelerator : undefined,
    submenu,
  };
}

export function readNativeMenuItems(input: unknown): NativeMenuItem[] | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const items: NativeMenuItem[] = [];
  for (const rawItem of input) {
    const item = readNativeMenuItem(rawItem);
    if (!item) {
      return null;
    }
    items.push(item);
  }
  return items;
}

function readPopupInput(input: unknown): NativeMenuPopupInput | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const items = readNativeMenuItems(record.items);
  if (!items) {
    return null;
  }
  return {
    items,
    x: typeof record.x === "number" ? Math.round(record.x) : undefined,
    y: typeof record.y === "number" ? Math.round(record.y) : undefined,
  };
}

export function buildNativeMenuTemplate(
  items: readonly NativeMenuItem[],
  onSelect: (id: string) => void,
): MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.kind === "separator") {
      return { type: "separator" };
    }
    const { id } = item;
    return {
      label: item.label ?? "",
      type: item.kind === "checkbox" ? "checkbox" : "normal",
      enabled: item.isEnabled ?? true,
      checked: item.isChecked ?? false,
      accelerator: item.accelerator,
      // The window's own key handling runs these shortcuts; the menu only shows them.
      registerAccelerator: false,
      submenu: item.submenu ? buildNativeMenuTemplate(item.submenu, onSelect) : undefined,
      click: id ? () => onSelect(id) : undefined,
    };
  });
}

/**
 * Shows a native menu for the renderer and answers with the chosen row's id, or null when the
 * menu closed without a choice. Chrome's context menus on macOS are native menus.
 */
export function registerNativeMenuIpc(): void {
  ipcMain.handle("paseo:menu:popup", (event, rawInput: unknown) => {
    const input = readPopupInput(rawInput);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!input || !window) {
      return null;
    }
    return new Promise<string | null>((resolve) => {
      let chosenId: string | null = null;
      const menu = Menu.buildFromTemplate(
        buildNativeMenuTemplate(input.items, (id) => {
          chosenId = id;
        }),
      );
      menu.popup({
        window,
        x: input.x,
        y: input.y,
        // A row's click can land after the close callback on some platforms; wait one turn.
        callback: () => setTimeout(() => resolve(chosenId), 0),
      });
    });
  });
}
