import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
}));

const { buildNativeMenuTemplate, readNativeMenuItems } = await import("./native-menu.js");

describe("readNativeMenuItems", () => {
  it("reads items, separators, checkboxes and submenus", () => {
    const items = readNativeMenuItems([
      { id: "pin", label: "Pin", kind: "checkbox", isChecked: true },
      { kind: "separator" },
      { label: "More", submenu: [{ id: "a", label: "A", isEnabled: false }] },
    ]);
    expect(items).toEqual([
      {
        id: "pin",
        label: "Pin",
        kind: "checkbox",
        isEnabled: undefined,
        isChecked: true,
        accelerator: undefined,
        submenu: undefined,
      },
      {
        id: undefined,
        label: undefined,
        kind: "separator",
        isEnabled: undefined,
        isChecked: undefined,
        accelerator: undefined,
        submenu: undefined,
      },
      {
        id: undefined,
        label: "More",
        kind: undefined,
        isEnabled: undefined,
        isChecked: undefined,
        accelerator: undefined,
        submenu: [
          {
            id: "a",
            label: "A",
            kind: undefined,
            isEnabled: false,
            isChecked: undefined,
            accelerator: undefined,
            submenu: undefined,
          },
        ],
      },
    ]);
  });

  it("rejects a menu with an unknown row kind or a malformed submenu", () => {
    expect(readNativeMenuItems([{ kind: "radio" }])).toBeNull();
    expect(readNativeMenuItems([{ label: "More", submenu: "nope" }])).toBeNull();
    expect(readNativeMenuItems("nope")).toBeNull();
  });
});

describe("buildNativeMenuTemplate", () => {
  it("reports the chosen row's id, including rows inside submenus", () => {
    const onSelect = vi.fn();
    const template = buildNativeMenuTemplate(
      [
        { id: "options", label: "Options" },
        { label: "More", submenu: [{ id: "remove", label: "Remove" }] },
      ],
      onSelect,
    );
    const click = (item: Electron.MenuItemConstructorOptions | undefined) =>
      (item?.click as (() => void) | undefined)?.();

    click(template[0]);
    const submenu = template[1]?.submenu as Electron.MenuItemConstructorOptions[];
    click(submenu[0]);

    expect(onSelect.mock.calls).toEqual([["options"], ["remove"]]);
  });

  it("shows a row's shortcut without binding it", () => {
    const template = buildNativeMenuTemplate(
      [{ id: "find", label: "Find…", accelerator: "CmdOrCtrl+F" }],
      () => {},
    );
    expect(template[0]).toMatchObject({ accelerator: "CmdOrCtrl+F", registerAccelerator: false });
  });

  it("draws disabled rows and checked checkboxes", () => {
    const template = buildNativeMenuTemplate(
      [
        { id: "a", label: "A", isEnabled: false },
        { id: "b", label: "B", kind: "checkbox", isChecked: true },
        { kind: "separator" },
      ],
      () => {},
    );
    expect(template[0]).toMatchObject({ enabled: false, type: "normal" });
    expect(template[1]).toMatchObject({ checked: true, type: "checkbox" });
    expect(template[2]).toEqual({ type: "separator" });
  });
});
