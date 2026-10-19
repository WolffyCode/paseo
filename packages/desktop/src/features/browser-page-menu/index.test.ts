import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

const { buildBrowserPageMenuTemplate, readBrowserPageMenuLabels, selectionForMenuLabel } =
  await import("./index.js");

const LABELS = {
  back: "Back",
  forward: "Forward",
  reload: "Reload",
  savePageAs: "Save As…",
  print: "Print…",
  viewPageSource: "View Page Source",
  inspect: "Inspect",
  openLinkInNewTab: "Open Link in New Tab",
  saveLinkAs: "Save Link As…",
  copyLinkAddress: "Copy Link Address",
  copyEmailAddress: "Copy Email Address",
  openImageInNewTab: "Open Image in New Tab",
  saveImageAs: "Save Image As…",
  copyImage: "Copy Image",
  copyImageAddress: "Copy Image Address",
  copy: "Copy",
  searchWebFor: "Search Google for “{{terms}}”",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  paste: "Paste",
  pasteAndMatchStyle: "Paste and Match Style",
  selectAll: "Select All",
  addToDictionary: "Add to Dictionary",
};

const EDIT_FLAGS = {
  canUndo: true,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
};

function params(overrides: Record<string, unknown> = {}) {
  return {
    x: 10,
    y: 20,
    linkURL: "",
    srcURL: "",
    hasImageContents: false,
    mediaType: "none",
    selectionText: "",
    isEditable: false,
    editFlags: EDIT_FLAGS,
    misspelledWord: "",
    dictionarySuggestions: [],
    pageURL: "https://example.com/",
    ...overrides,
  } as Parameters<typeof buildBrowserPageMenuTemplate>[0]["params"];
}

function actions() {
  return {
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    savePage: vi.fn(),
    print: vi.fn(),
    openInNewTab: vi.fn(),
    searchInNewTab: vi.fn(),
    download: vi.fn(),
    copyText: vi.fn(),
    copyImageAt: vi.fn(),
    inspectAt: vi.fn(),
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    pasteAndMatchStyle: vi.fn(),
    selectAll: vi.fn(),
  };
}

function clickItem(template: ReturnType<typeof buildBrowserPageMenuTemplate>, index: number) {
  const item = template[index];
  if (!item || typeof item.click !== "function") {
    throw new Error(`no clickable item at ${index}`);
  }
  (item.click as () => void)();
}

function labelsOf(template: ReturnType<typeof buildBrowserPageMenuTemplate>): string[] {
  return template.map((item) => (item.type === "separator" ? "—" : String(item.label)));
}

function build(overrides: Record<string, unknown>, options: { canOpenTabs?: boolean } = {}) {
  const pageActions = actions();
  const template = buildBrowserPageMenuTemplate({
    labels: LABELS,
    params: params(overrides),
    actions: pageActions,
    canGoBack: false,
    canGoForward: false,
    canOpenTabs: options.canOpenTabs ?? true,
    extensionItems: [],
  });
  return { template, pageActions };
}

describe("buildBrowserPageMenuTemplate", () => {
  it("offers Chrome's page items on an empty spot", () => {
    const { template } = build({});
    expect(labelsOf(template)).toEqual([
      "Back",
      "Forward",
      "Reload",
      "—",
      "Save As…",
      "Print…",
      "—",
      "View Page Source",
      "—",
      "Inspect",
    ]);
    expect(template[0]).toMatchObject({ enabled: false });
  });

  it("offers Chrome's link items and opens the link in a new tab", () => {
    const { template, pageActions } = build({ linkURL: "https://a.test/" });
    expect(labelsOf(template)).toEqual([
      "Open Link in New Tab",
      "—",
      "Save Link As…",
      "Copy Link Address",
      "—",
      "Inspect",
    ]);
    clickItem(template, 0);
    expect(pageActions.openInNewTab).toHaveBeenCalledWith("https://a.test/");
  });

  it("copies an email address for a mailto link", () => {
    const { template, pageActions } = build({ linkURL: "mailto:me@a.test" });
    clickItem(template, 0);
    expect(pageActions.copyText).toHaveBeenCalledWith("me@a.test");
  });

  it("offers Chrome's image items", () => {
    const { template } = build({ hasImageContents: true, srcURL: "https://a.test/i.png" });
    expect(labelsOf(template)).toEqual([
      "Open Image in New Tab",
      "Save Image As…",
      "Copy Image",
      "Copy Image Address",
      "—",
      "Inspect",
    ]);
  });

  it("quotes the selection in the search item and searches it in a new tab", () => {
    const { template, pageActions } = build({ selectionText: "hello  world" });
    expect(labelsOf(template)).toEqual([
      "Copy",
      "Search Google for “hello world”",
      "Print…",
      "—",
      "Inspect",
    ]);
    clickItem(template, 1);
    expect(pageActions.searchInNewTab).toHaveBeenCalledWith("hello  world");
  });

  it("offers spelling fixes and editing items in a field", () => {
    const { template } = build({
      isEditable: true,
      misspelledWord: "teh",
      dictionarySuggestions: ["the", "ten"],
    });
    expect(labelsOf(template)).toEqual([
      "the",
      "ten",
      "Add to Dictionary",
      "—",
      "Undo",
      "Redo",
      "—",
      "Cut",
      "Copy",
      "Paste",
      "Paste and Match Style",
      "Select All",
      "—",
      "Inspect",
    ]);
    expect(template[5]).toMatchObject({ enabled: false });
  });

  it("leaves out tab items for pages that can't open tabs", () => {
    const { template } = build({ linkURL: "https://a.test/" }, { canOpenTabs: false });
    expect(labelsOf(template)).toEqual(["Save Link As…", "Copy Link Address", "—", "Inspect"]);
  });
});

describe("selectionForMenuLabel", () => {
  it("keeps short selections on one line and cuts long ones at a word", () => {
    expect(selectionForMenuLabel(" a\n b ")).toBe("a b");
    const long = "word ".repeat(20);
    expect(selectionForMenuLabel(long)).toBe(`${"word ".repeat(10).trim()}…`);
  });
});

describe("readBrowserPageMenuLabels", () => {
  it("takes a complete label table and rejects a partial one", () => {
    expect(readBrowserPageMenuLabels(LABELS)).toEqual(LABELS);
    expect(readBrowserPageMenuLabels({ back: "Back" })).toBeNull();
  });
});
