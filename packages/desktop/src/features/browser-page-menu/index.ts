import { ipcMain, type MenuItem, type MenuItemConstructorOptions } from "electron";

/**
 * Chrome's page context menu labels in the user's language. The main process has no
 * translations, so the window sends these whenever its language is set.
 */
export interface BrowserPageMenuLabels {
  back: string;
  forward: string;
  reload: string;
  savePageAs: string;
  print: string;
  viewPageSource: string;
  inspect: string;
  openLinkInNewTab: string;
  saveLinkAs: string;
  copyLinkAddress: string;
  copyEmailAddress: string;
  openImageInNewTab: string;
  saveImageAs: string;
  copyImage: string;
  copyImageAddress: string;
  copy: string;
  /** Holds a `{{terms}}` slot for the selected text, the engine already filled in. */
  searchWebFor: string;
  undo: string;
  redo: string;
  cut: string;
  paste: string;
  pasteAndMatchStyle: string;
  selectAll: string;
  addToDictionary: string;
}

const LABEL_KEYS: readonly (keyof BrowserPageMenuLabels)[] = [
  "back",
  "forward",
  "reload",
  "savePageAs",
  "print",
  "viewPageSource",
  "inspect",
  "openLinkInNewTab",
  "saveLinkAs",
  "copyLinkAddress",
  "copyEmailAddress",
  "openImageInNewTab",
  "saveImageAs",
  "copyImage",
  "copyImageAddress",
  "copy",
  "searchWebFor",
  "undo",
  "redo",
  "cut",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
  "addToDictionary",
];
const SEARCH_TERMS_SLOT = "{{terms}}";
// Chrome cuts the selection in "Search Google for …" to 50 characters at a word break
// (render_view_context_menu.cc kMaxSelectionTextLength).
const MAX_SELECTION_IN_LABEL = 50;
const MAILTO_PREFIX = "mailto:";
const VIEW_SOURCE_PREFIX = "view-source:";

export function readBrowserPageMenuLabels(input: unknown): BrowserPageMenuLabels | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const labels: Partial<BrowserPageMenuLabels> = {};
  for (const key of LABEL_KEYS) {
    const value = record[key];
    if (typeof value !== "string") {
      return null;
    }
    labels[key] = value;
  }
  return labels as BrowserPageMenuLabels;
}

/** The selection as the search item quotes it: one line, at most 50 characters. */
export function selectionForMenuLabel(selection: string): string {
  const oneLine = selection.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_SELECTION_IN_LABEL) {
    return oneLine;
  }
  const cut = oneLine.slice(0, MAX_SELECTION_IN_LABEL);
  const wordBreak = cut.lastIndexOf(" ");
  const kept = wordBreak > 0 ? cut.slice(0, wordBreak) : cut;
  return `${kept}…`;
}

/** What the page menu's items do; the caller binds them to the page that was clicked. */
export interface BrowserPageMenuActions {
  goBack(): void;
  goForward(): void;
  reload(): void;
  savePage(): void;
  print(): void;
  openInNewTab(url: string): void;
  searchInNewTab(terms: string): void;
  download(url: string): void;
  copyText(text: string): void;
  copyImageAt(x: number, y: number): void;
  inspectAt(x: number, y: number): void;
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  pasteAndMatchStyle(): void;
  selectAll(): void;
}

type PageMenuParams = Pick<
  Electron.ContextMenuParams,
  | "x"
  | "y"
  | "linkURL"
  | "srcURL"
  | "hasImageContents"
  | "mediaType"
  | "selectionText"
  | "isEditable"
  | "editFlags"
  | "misspelledWord"
  | "dictionarySuggestions"
  | "pageURL"
>;

const SEPARATOR: MenuItemConstructorOptions = { type: "separator" };

function linkItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
  canOpenTabs: boolean;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  const link = params.linkURL;
  if (link.startsWith(MAILTO_PREFIX)) {
    return [
      {
        label: labels.copyEmailAddress,
        click: () => actions.copyText(link.slice(MAILTO_PREFIX.length)),
      },
    ];
  }
  return [
    ...(input.canOpenTabs
      ? [{ label: labels.openLinkInNewTab, click: () => actions.openInNewTab(link) }]
      : []),
    SEPARATOR,
    { label: labels.saveLinkAs, click: () => actions.download(link) },
    { label: labels.copyLinkAddress, click: () => actions.copyText(link) },
  ];
}

function imageItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
  canOpenTabs: boolean;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  const image = params.srcURL;
  return [
    ...(input.canOpenTabs
      ? [{ label: labels.openImageInNewTab, click: () => actions.openInNewTab(image) }]
      : []),
    { label: labels.saveImageAs, click: () => actions.download(image) },
    { label: labels.copyImage, click: () => actions.copyImageAt(params.x, params.y) },
    { label: labels.copyImageAddress, click: () => actions.copyText(image) },
  ];
}

function spellingItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  if (!params.misspelledWord) {
    return [];
  }
  return [
    ...params.dictionarySuggestions.map((suggestion) => ({
      label: suggestion,
      click: () => actions.replaceMisspelling(suggestion),
    })),
    {
      label: labels.addToDictionary,
      click: () => actions.addToDictionary(params.misspelledWord),
    },
    SEPARATOR,
  ];
}

function editableItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  const flags = params.editFlags;
  return [
    ...spellingItems(input),
    { label: labels.undo, enabled: flags.canUndo, click: () => actions.undo() },
    { label: labels.redo, enabled: flags.canRedo, click: () => actions.redo() },
    SEPARATOR,
    { label: labels.cut, enabled: flags.canCut, click: () => actions.cut() },
    { label: labels.copy, enabled: flags.canCopy, click: () => actions.copy() },
    { label: labels.paste, enabled: flags.canPaste, click: () => actions.paste() },
    {
      label: labels.pasteAndMatchStyle,
      enabled: flags.canPaste,
      click: () => actions.pasteAndMatchStyle(),
    },
    { label: labels.selectAll, enabled: flags.canSelectAll, click: () => actions.selectAll() },
  ];
}

function selectionItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
  canOpenTabs: boolean;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  const searchLabel = labels.searchWebFor.replace(
    SEARCH_TERMS_SLOT,
    selectionForMenuLabel(params.selectionText),
  );
  return [
    { label: labels.copy, click: () => actions.copy() },
    ...(input.canOpenTabs
      ? [{ label: searchLabel, click: () => actions.searchInNewTab(params.selectionText) }]
      : []),
    { label: labels.print, click: () => actions.print() },
  ];
}

function pageItems(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
  canGoBack: boolean;
  canGoForward: boolean;
  canOpenTabs: boolean;
}): MenuItemConstructorOptions[] {
  const { labels, params, actions } = input;
  return [
    { label: labels.back, enabled: input.canGoBack, click: () => actions.goBack() },
    { label: labels.forward, enabled: input.canGoForward, click: () => actions.goForward() },
    { label: labels.reload, click: () => actions.reload() },
    SEPARATOR,
    { label: labels.savePageAs, click: () => actions.savePage() },
    { label: labels.print, click: () => actions.print() },
    SEPARATOR,
    ...(input.canOpenTabs
      ? [
          {
            label: labels.viewPageSource,
            click: () => actions.openInNewTab(`${VIEW_SOURCE_PREFIX}${params.pageURL}`),
          },
        ]
      : []),
  ];
}

type PageMenuItem = MenuItemConstructorOptions | MenuItem;

/** Drops leading, trailing and doubled separators, as SimpleMenuModel does. */
function tidySeparators(items: PageMenuItem[]): PageMenuItem[] {
  const tidy: PageMenuItem[] = [];
  for (const item of items) {
    const isSeparator = item.type === "separator";
    const previous = tidy[tidy.length - 1];
    if (isSeparator && (!previous || previous.type === "separator")) {
      continue;
    }
    tidy.push(item);
  }
  while (tidy[tidy.length - 1]?.type === "separator") {
    tidy.pop();
  }
  return tidy;
}

/**
 * Chrome's page context menu (RenderViewContextMenu) for what was clicked: a link, an image,
 * selected text, an editable field, or the page itself; then extension items and Inspect.
 * Items for features this browser lacks (Cast, Lens, translate, QR codes, reading mode,
 * profiles, incognito) are left out.
 */
export function buildBrowserPageMenuTemplate(input: {
  labels: BrowserPageMenuLabels;
  params: PageMenuParams;
  actions: BrowserPageMenuActions;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Pages outside a browser window (pop-ups) can't open tabs. */
  canOpenTabs: boolean;
  /** Items extensions added with chrome.contextMenus, as the extensions runtime builds them. */
  extensionItems: PageMenuItem[];
}): PageMenuItem[] {
  const { labels, params, actions } = input;
  const hasLink = params.linkURL.length > 0;
  const hasImage = params.hasImageContents && params.srcURL.length > 0;
  const hasSelection = params.selectionText.trim().length > 0;
  const items: PageMenuItem[] = [];
  if (hasLink) {
    items.push(...linkItems(input), SEPARATOR);
  }
  if (hasImage) {
    items.push(...imageItems(input), SEPARATOR);
  }
  if (params.isEditable) {
    items.push(...editableItems(input), SEPARATOR);
  } else if (hasSelection) {
    items.push(...selectionItems(input), SEPARATOR);
  } else if (!hasLink && !hasImage) {
    items.push(...pageItems(input), SEPARATOR);
  }
  items.push(...input.extensionItems, SEPARATOR);
  items.push({ label: labels.inspect, click: () => actions.inspectAt(params.x, params.y) });
  return tidySeparators(items);
}

/** Holds the labels the window last sent. */
export class BrowserPageMenu {
  private labels: BrowserPageMenuLabels | null = null;

  registerIpc(): void {
    ipcMain.handle("paseo:browser:set-page-menu-labels", (_event, rawLabels: unknown) => {
      const labels = readBrowserPageMenuLabels(rawLabels);
      if (labels) {
        this.labels = labels;
      }
    });
  }

  /** Null until the window has sent its labels, right after it starts. */
  currentLabels(): BrowserPageMenuLabels | null {
    return this.labels;
  }
}
