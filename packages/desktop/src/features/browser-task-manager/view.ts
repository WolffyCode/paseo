import type { TaskManagerAppearance, TaskManagerView, TaskManagerWindowState } from "./channels.js";
import {
  ALL_TASKS_GLYPH,
  CLEAR_GLYPH,
  PLUGIN_FAVICON_URL,
  SEARCH_GLYPH,
  TABS_AND_EXTENSIONS_GLYPH,
  type TaskManagerGlyph,
} from "./icons.js";
import { TASK_CATEGORIES, type TaskCategory, type TaskRow } from "./model.js";
import { TASK_MANAGER_FONT_FAMILY, TASK_MANAGER_STYLES } from "./styles.js";
import {
  groupTaskRows,
  sortAfterHeaderClick,
  sortTaskGroups,
  TASK_COLUMNS,
  taskCellText,
  visibleTaskGroups,
  type TaskColumnId,
  type TaskGroup,
} from "./table.js";

/** What the page asks of the main process. */
export interface TaskManagerBridge {
  onRows(handler: (rows: TaskRow[]) => void): void;
  onAppearance(handler: (appearance: TaskManagerAppearance) => void): void;
  onSelect(handler: (browserId: string | null) => void): void;
  endTasks(pids: number[]): Promise<boolean>;
  activate(browserId: string): void;
  saveView(view: TaskManagerView): void;
  showColumnMenu(visibleColumns: TaskColumnId[]): Promise<TaskColumnId | null>;
  close(): void;
  setMinimumContentSize(size: { width: number; height: number }): void;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// TaskManagerSearchBarView's kInputChangeCallbackDelay.
const SEARCH_DELAY_MS = 50;
// table_utils.cc: 12 dip of padding on each side of a cell, 22 more for a header's sort triangle.
const CELL_PADDING = 24;
const SORT_SLOT = 22;
const MIN_COLUMN_WIDTH = 10;
const HEADER_FONT = `500 13px ${TASK_MANAGER_FONT_FAMILY}`;
const CELL_FONT = `12px ${TASK_MANAGER_FONT_FAMILY}`;
// The selected tab's bar sweeps across both tabs, then settles on the new one (tabbed_pane.cc).
const BAR_EXPAND = "150ms cubic-bezier(0.4, 0, 1, 1)";
const BAR_CONTRACT = "180ms cubic-bezier(0, 0, 0.2, 1)";
const BAR_EXPAND_MS = 150;
// The window's least size: the tabs, the search field's 160 dip and the 20 dip insets, and
// 4 + 50 + 16 + 24 + 56 dip of header, gaps and button row over an empty table.
const SEARCH_MIN_WIDTH = 160;
const HORIZONTAL_INSETS = 40;
const MIN_CONTENT_HEIGHT = 150;

function svgGlyph(document: Document, glyph: TaskManagerGlyph): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", glyph.viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", glyph.d);
  path.setAttribute("fill", "currentColor");
  if (glyph.isEvenOdd) path.setAttribute("fill-rule", "evenodd");
  svg.append(path);
  return svg;
}

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  return created;
}

/** Draws Chrome's task manager into `document` and runs it until the window closes. */
export function mountTaskManagerView(
  document: Document,
  bridge: TaskManagerBridge,
  state: TaskManagerWindowState,
): void {
  new TaskManagerPage(document, bridge, state).mount();
}

class TaskManagerPage {
  private appearance: TaskManagerAppearance;
  private view: TaskManagerView;
  private rows: TaskRow[] = [];
  private shownGroups: TaskGroup[] = [];
  private query = "";
  private selectedPids = new Set<number>();
  private anchorPid: number | null = null;
  private focusPid: number | null = null;
  private hoveredPid: number | null = null;
  private pendingSelectBrowserId: string | null;
  // Where the selection was, so a process that ends hands it to the row taking its place.
  private lastSelectionIndex: number | null = null;
  private columnWidths = new Map<TaskColumnId, number>();
  private hasMeasuredColumns = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private tabBarTimer: ReturnType<typeof setTimeout> | null = null;
  private isResizingColumn = false;
  private isEndingTasks = false;
  // The drawn rows of each process, restyled in place as selection and hover move, so a
  // double-click lands on the row its first click pressed.
  private rowElementsByPid = new Map<number, HTMLElement[]>();

  private readonly measureContext: CanvasRenderingContext2D | null;
  private readonly tabsElement: HTMLDivElement;
  private readonly tabElements = new Map<TaskCategory, HTMLButtonElement>();
  private readonly tabBar: HTMLDivElement;
  private readonly searchInput: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly tableElement: HTMLDivElement;
  private readonly headElement: HTMLDivElement;
  private readonly bodyElement: HTMLDivElement;
  private readonly endButton: HTMLButtonElement;
  private readonly liveRegion: HTMLDivElement;
  private readonly rootElement: HTMLDivElement;

  public constructor(
    private readonly document: Document,
    private readonly bridge: TaskManagerBridge,
    state: TaskManagerWindowState,
  ) {
    this.appearance = state;
    this.view = state.view;
    this.rows = state.rows;
    this.pendingSelectBrowserId = state.selectedBrowserId;
    this.measureContext = document.createElement("canvas").getContext("2d");

    const root = element(document, "div", "tm");
    this.rootElement = root;
    const header = element(document, "div", "tm-header");
    this.tabsElement = element(document, "div", "tm-tabs");
    this.tabsElement.setAttribute("role", "tablist");
    for (const category of TASK_CATEGORIES) {
      const tab = element(document, "button", "tm-tab");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.addEventListener("click", () => this.setCategory(category));
      this.tabElements.set(category, tab);
      this.tabsElement.append(tab);
    }
    this.tabBar = element(document, "div", "tm-tab-bar");
    this.tabsElement.append(this.tabBar);

    const search = element(document, "div", "tm-search");
    const searchIcon = svgGlyph(document, SEARCH_GLYPH);
    searchIcon.classList.add("tm-search-icon");
    this.searchInput = element(document, "input", "");
    this.searchInput.type = "search";
    this.searchInput.addEventListener("input", () => this.handleSearchInput());
    this.clearButton = element(document, "button", "tm-clear");
    this.clearButton.type = "button";
    this.clearButton.hidden = true;
    this.clearButton.append(svgGlyph(document, CLEAR_GLYPH));
    this.clearButton.addEventListener("click", () => this.clearSearch());
    search.append(searchIcon, this.searchInput, this.clearButton);
    header.append(
      this.tabsElement,
      element(document, "div", "tm-header-space"),
      search,
      element(document, "div", "tm-divider"),
    );

    this.tableElement = element(document, "div", "tm-table");
    this.tableElement.setAttribute("role", "grid");
    this.tableElement.setAttribute("aria-multiselectable", "true");
    this.headElement = element(document, "div", "tm-head");
    this.headElement.setAttribute("role", "row");
    this.bodyElement = element(document, "div", "tm-body");
    this.bodyElement.tabIndex = 0;
    this.bodyElement.addEventListener("scroll", () => {
      this.headElement.scrollLeft = this.bodyElement.scrollLeft;
    });
    this.bodyElement.addEventListener("focus", () => this.selectFirstWhenNothingIs());
    this.bodyElement.addEventListener("keydown", (event) => this.handleTableKey(event));
    this.bodyElement.addEventListener("mouseleave", () => this.setHoveredPid(null));
    this.tableElement.append(this.headElement, this.bodyElement);

    const buttons = element(document, "div", "tm-buttons");
    this.endButton = element(document, "button", "tm-end");
    this.endButton.type = "button";
    this.endButton.addEventListener("click", () => void this.endSelectedTasks());
    this.liveRegion = element(document, "div", "tm-status");
    this.liveRegion.setAttribute("role", "status");
    buttons.append(this.liveRegion, this.endButton);
    root.append(header, this.tableElement, buttons);
  }

  /** Puts the page in the window and starts listening to it and to the main process. */
  public mount(): void {
    const style = this.document.createElement("style");
    style.textContent = TASK_MANAGER_STYLES;
    this.document.head.append(style);
    this.document.body.append(this.rootElement);

    this.document.addEventListener("keydown", (event) => this.handleWindowKey(event), true);
    this.document.addEventListener("contextmenu", (event) => void this.handleContextMenu(event));
    const resizeObserver = new ResizeObserver(() => this.measureColumns());
    resizeObserver.observe(this.tableElement);

    this.bridge.onRows((rows) => this.setRows(rows));
    this.bridge.onAppearance((appearance) => this.setAppearance(appearance));
    this.bridge.onSelect((browserId) => {
      this.pendingSelectBrowserId = browserId;
      this.selectPendingPage();
      this.updateRowStates();
    });

    this.applyAppearance();
    this.selectPendingPage();
    this.updateRowStates();
    this.moveTabBar(false);
    // TaskManagerView focuses the table when it opens.
    this.bodyElement.focus();
  }

  private get strings() {
    return this.appearance.strings;
  }

  private setAppearance(appearance: TaskManagerAppearance): void {
    this.appearance = appearance;
    this.applyAppearance();
    this.moveTabBar(false);
    this.measureColumns();
  }

  private applyAppearance(): void {
    const { strings, colorScheme } = this.appearance;
    this.document.documentElement.dataset.scheme = colorScheme;
    this.document.documentElement.lang = strings.locale;
    this.document.title = strings.title;
    for (const [category, tab] of this.tabElements) {
      tab.replaceChildren(this.categoryGlyph(category), strings.categories[category]);
    }
    this.searchInput.placeholder = strings.searchPlaceholder;
    this.searchInput.setAttribute("aria-label", strings.searchAccessibleName);
    this.clearButton.setAttribute("aria-label", strings.clearSearch);
    this.endButton.textContent = strings.endTask;
    this.endButton.setAttribute("aria-description", strings.endTaskAccessibleName);
    this.updateShownGroups();
    this.renderTabs();
    this.renderHead();
    this.renderBody();
    this.reportMinimumSize();
  }

  private categoryGlyph(category: TaskCategory): SVGSVGElement {
    if (category === "tabsAndExtensions") return svgGlyph(this.document, TABS_AND_EXTENSIONS_GLYPH);
    if (category === "all") return svgGlyph(this.document, ALL_TASKS_GLYPH);
    // Chrome marks its browser processes with its own logo; Helm's stand under Helm's.
    return svgGlyph(this.document, this.appearance.productLogo);
  }

  private reportMinimumSize(): void {
    this.bridge.setMinimumContentSize({
      width: this.tabsElement.offsetWidth + SEARCH_MIN_WIDTH + HORIZONTAL_INSETS,
      height: MIN_CONTENT_HEIGHT,
    });
  }

  private renderTabs(): void {
    for (const [category, tab] of this.tabElements) {
      const isSelected = category === this.view.category;
      tab.setAttribute("aria-selected", String(isSelected));
      // Only the selected tab takes focus, and only from full keyboard access (tabbed_pane.cc).
      tab.tabIndex = isSelected ? 0 : -1;
    }
  }

  private moveTabBar(isAnimated: boolean): void {
    if (this.tabBarTimer) clearTimeout(this.tabBarTimer);
    this.tabBarTimer = null;
    const tab = this.tabElements.get(this.view.category);
    if (!tab) return;
    const left = tab.offsetLeft;
    const width = tab.offsetWidth;
    const bar = this.tabBar;
    if (!isAnimated) {
      bar.style.transition = "none";
      bar.style.left = `${left}px`;
      bar.style.width = `${width}px`;
      return;
    }
    const currentLeft = bar.offsetLeft;
    const currentRight = currentLeft + bar.offsetWidth;
    const spanLeft = Math.min(currentLeft, left);
    bar.style.transition = `left ${BAR_EXPAND}, width ${BAR_EXPAND}`;
    bar.style.left = `${spanLeft}px`;
    bar.style.width = `${Math.max(currentRight, left + width) - spanLeft}px`;
    this.tabBarTimer = setTimeout(() => {
      this.tabBarTimer = null;
      bar.style.transition = `left ${BAR_CONTRACT}, width ${BAR_CONTRACT}`;
      bar.style.left = `${left}px`;
      bar.style.width = `${width}px`;
    }, BAR_EXPAND_MS);
  }

  private setCategory(category: TaskCategory): void {
    if (category === this.view.category) return;
    this.view = { ...this.view, category };
    this.bridge.saveView(this.view);
    // Switching the category clears the selection (TaskManagerView::OnTabSelected).
    this.clearSelection();
    this.renderTabs();
    this.moveTabBar(true);
    this.updateShownGroups();
    this.renderBody();
  }

  private cycleCategory(step: 1 | -1): void {
    const index = TASK_CATEGORIES.indexOf(this.view.category);
    const next = (index + step + TASK_CATEGORIES.length) % TASK_CATEGORIES.length;
    this.setCategory(TASK_CATEGORIES[next]);
  }

  private handleSearchInput(): void {
    this.clearButton.hidden = this.searchInput.value === "";
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.setQuery(this.searchInput.value), SEARCH_DELAY_MS);
  }

  private clearSearch(): void {
    this.searchInput.value = "";
    this.clearButton.hidden = true;
    this.setQuery("");
    this.searchInput.focus();
  }

  private setQuery(query: string): void {
    this.query = query;
    this.updateShownGroups();
    // A selected process that no longer matches drops out of the selection.
    const shownPids = new Set(this.shownGroups.map((group) => group.pid));
    this.selectedPids = new Set([...this.selectedPids].filter((pid) => shownPids.has(pid)));
    this.renderBody();
  }

  private setRows(rows: TaskRow[]): void {
    const hadSelection = this.selectedPids.size > 0;
    this.rows = rows;
    this.updateShownGroups();
    const shownPids = new Set(this.shownGroups.map((group) => group.pid));
    this.selectedPids = new Set([...this.selectedPids].filter((pid) => shownPids.has(pid)));
    // select_on_remove: when the selected process ends, the row now in its place is selected.
    if (this.anchorPid !== null && !shownPids.has(this.anchorPid)) this.anchorPid = null;
    if (this.focusPid !== null && !shownPids.has(this.focusPid)) this.focusPid = null;
    if (hadSelection && this.selectedPids.size === 0 && this.lastSelectionIndex !== null) {
      const replacement =
        this.shownGroups[Math.min(this.lastSelectionIndex, this.shownGroups.length - 1)];
      if (replacement) this.selectOnly(replacement.pid);
    }
    this.selectPendingPage();
    if (!this.hasMeasuredColumns) this.measureColumns();
    this.renderBody();
  }

  private updateShownGroups(): void {
    const groups = visibleTaskGroups({
      groups: groupTaskRows(this.rows),
      category: this.view.category,
      query: this.query,
      strings: this.strings,
    });
    this.shownGroups = sortTaskGroups(groups, this.view.sortKeys, this.strings);
  }

  /** The page the task manager was opened from gets its row selected once that row shows. */
  private selectPendingPage(): void {
    const browserId = this.pendingSelectBrowserId;
    if (browserId === null || this.rows.length === 0) return;
    const requestedRow = this.rows.find(
      (candidate) => candidate.title.kind === "tab" && candidate.browserId === browserId,
    );
    if (!requestedRow) return;
    this.pendingSelectBrowserId = null;
    if (this.view.category === "browser") this.setCategory("tabsAndExtensions");
    if (this.query !== "") {
      this.query = "";
      this.searchInput.value = "";
      this.clearButton.hidden = true;
      this.updateShownGroups();
      this.renderBody();
    }
    const group = this.shownGroups.find((candidate) =>
      candidate.rows.some((row) => row.title.kind === "tab" && row.browserId === browserId),
    );
    if (group) {
      this.selectOnly(group.pid);
      this.scrollGroupIntoView(group.pid);
    }
  }

  private textWidth(text: string, font: string): number {
    if (!this.measureContext) return 0;
    this.measureContext.font = font;
    return this.measureContext.measureText(text).width;
  }

  /**
   * table_utils.cc's widths, taken again whenever the table's width or its columns change: every
   * column fits its title and its widest cell, and Task takes what is left.
   */
  private measureColumns(): void {
    const available = this.tableElement.clientWidth;
    if (available === 0) return;
    this.hasMeasuredColumns = this.rows.length > 0;
    let othersWidth = 0;
    for (const columnId of this.view.visibleColumns) {
      if (columnId === "task") continue;
      let widest = this.textWidth(this.strings.columns[columnId], HEADER_FONT) + SORT_SLOT;
      for (const group of this.shownGroups) {
        group.rows.forEach((row, index) => {
          const text = taskCellText({
            columnId,
            row,
            isFirstRowOfProcess: index === 0,
            strings: this.strings,
          });
          widest = Math.max(widest, this.textWidth(text, CELL_FONT));
        });
      }
      const width = Math.ceil(widest) + CELL_PADDING;
      this.columnWidths.set(columnId, width);
      othersWidth += width;
    }
    const taskMinimum =
      Math.ceil(this.textWidth(this.strings.columns.task, HEADER_FONT)) + CELL_PADDING + SORT_SLOT;
    this.columnWidths.set("task", Math.max(taskMinimum, available - othersWidth));
    this.renderHead();
    this.renderBody();
  }

  private columnMinimumWidth(columnId: TaskColumnId): number {
    const titleWidth = Math.ceil(this.textWidth(this.strings.columns[columnId], HEADER_FONT));
    return Math.max(MIN_COLUMN_WIDTH, titleWidth + CELL_PADDING);
  }

  private renderHead(): void {
    const cells: HTMLElement[] = [];
    let edge = 0;
    for (const columnId of this.view.visibleColumns) {
      const column = TASK_COLUMNS[columnId];
      const width = this.columnWidths.get(columnId) ?? 0;
      const cell = element(
        this.document,
        "div",
        column.isRightAligned ? "tm-hcell is-right" : "tm-hcell",
      );
      cell.setAttribute("role", "columnheader");
      cell.style.width = `${width}px`;
      const title = element(this.document, "span", "tm-hcell-title");
      title.textContent = this.strings.columns[columnId];
      cell.append(title);
      const sortKey = this.view.sortKeys[0];
      if (sortKey?.columnId === columnId) {
        const direction = sortKey.isAscending ? "ascending" : "descending";
        cell.setAttribute("aria-sort", direction);
        cell.append(element(this.document, "span", `tm-sort is-${direction}`));
      }
      cell.addEventListener("click", () => this.sortBy(columnId));
      cells.push(cell);
      edge += width;
      const handle = element(this.document, "div", "tm-resize");
      handle.style.left = `${edge}px`;
      handle.addEventListener("mousedown", (event) => this.startColumnResize(event, columnId));
      cells.push(handle);
    }
    this.headElement.style.position = "relative";
    this.headElement.replaceChildren(...cells);
  }

  private sortBy(columnId: TaskColumnId): void {
    if (this.isResizingColumn) return;
    this.view = { ...this.view, sortKeys: sortAfterHeaderClick(this.view.sortKeys, columnId) };
    this.bridge.saveView(this.view);
    this.updateShownGroups();
    this.renderHead();
    this.renderBody();
  }

  /** Dragging a header's edge resizes its column (TableHeader); the widths aren't kept. */
  private startColumnResize(event: MouseEvent, columnId: TaskColumnId): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.columnWidths.get(columnId) ?? 0;
    const minimum = this.columnMinimumWidth(columnId);
    this.isResizingColumn = true;
    const move = (moveEvent: MouseEvent) => {
      this.columnWidths.set(columnId, Math.max(minimum, startWidth + moveEvent.clientX - startX));
      this.renderHead();
      this.renderBody();
    };
    const finish = () => {
      this.document.removeEventListener("mousemove", move);
      this.document.removeEventListener("mouseup", finish);
      // The click that ends the drag must not sort the column.
      setTimeout(() => {
        this.isResizingColumn = false;
      });
    };
    this.document.addEventListener("mousemove", move);
    this.document.addEventListener("mouseup", finish);
  }

  /** The table's right-click menu: every column as a check item (TaskManagerView). */
  private async handleContextMenu(event: MouseEvent): Promise<void> {
    if (event.target === this.searchInput) return;
    event.preventDefault();
    const columnId = await this.bridge.showColumnMenu([...this.view.visibleColumns]);
    if (!columnId) return;
    const isVisible = this.view.visibleColumns.includes(columnId);
    if (isVisible && this.view.visibleColumns.length === 1) return;
    // A column shown again joins at the right end.
    const visibleColumns = isVisible
      ? this.view.visibleColumns.filter((visible) => visible !== columnId)
      : [...this.view.visibleColumns, columnId];
    this.view = { ...this.view, visibleColumns };
    this.bridge.saveView(this.view);
    this.measureColumns();
  }

  private renderBody(): void {
    const rowElements: HTMLElement[] = [];
    this.rowElementsByPid = new Map();
    for (const group of this.shownGroups) {
      const groupElements = group.rows.map((row, index) => this.renderRow(row, index === 0));
      this.rowElementsByPid.set(group.pid, groupElements);
      rowElements.push(...groupElements);
    }
    const scrollTop = this.bodyElement.scrollTop;
    this.bodyElement.replaceChildren(...rowElements);
    this.bodyElement.scrollTop = scrollTop;
    this.updateRowStates();
  }

  /** Marks the selected and hovered processes' rows, and enables 结束任务 to match. */
  private updateRowStates(): void {
    for (const [pid, rowElements] of this.rowElementsByPid) {
      const isSelected = this.selectedPids.has(pid);
      // A hovered process is lit unless it is selected (TableView).
      const isHovered = !isSelected && this.hoveredPid === pid;
      for (const rowElement of rowElements) {
        rowElement.classList.toggle("is-selected", isSelected);
        rowElement.classList.toggle("is-hovered", isHovered);
        rowElement.setAttribute("aria-selected", String(isSelected));
      }
    }
    this.updateEndButton();
  }

  private renderRow(row: TaskRow, isFirstRowOfProcess: boolean): HTMLElement {
    const rowElement = element(this.document, "div", "tm-row");
    rowElement.setAttribute("role", "row");
    rowElement.addEventListener("mousedown", (event) => this.handleRowPress(event, row));
    rowElement.addEventListener("dblclick", () => this.activateRow(row));
    rowElement.addEventListener("mouseenter", () => this.setHoveredPid(row.pid));
    for (const columnId of this.view.visibleColumns) {
      const column = TASK_COLUMNS[columnId];
      const cell = element(
        this.document,
        "div",
        column.isRightAligned ? "tm-cell is-right" : "tm-cell",
      );
      cell.setAttribute("role", "gridcell");
      cell.style.width = `${this.columnWidths.get(columnId) ?? 0}px`;
      const text = taskCellText({ columnId, row, isFirstRowOfProcess, strings: this.strings });
      if (columnId === "task") cell.append(this.renderTaskIcon(row));
      const textElement = element(this.document, "span", "tm-cell-text");
      textElement.textContent = text;
      // TableView's tooltip shows the cell's whole text.
      cell.title = text;
      cell.append(textElement);
      rowElement.append(cell);
    }
    return rowElement;
  }

  private renderTaskIcon(row: TaskRow): HTMLElement {
    const icon = element(this.document, "span", "tm-task-icon");
    const { kind } = row.icon;
    if (kind === "none") return icon;
    // icons_have_background: a 24 dip rounded plate behind every icon.
    icon.classList.add("has-plate");
    if (kind === "product") {
      icon.append(svgGlyph(this.document, this.appearance.productLogo));
      return icon;
    }
    const image = this.document.createElement("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.src = row.icon.kind === "favicon" ? row.icon.url : PLUGIN_FAVICON_URL;
    image.addEventListener("error", () => image.remove());
    icon.append(image);
    return icon;
  }

  private setHoveredPid(pid: number | null): void {
    if (pid === this.hoveredPid) return;
    this.hoveredPid = pid;
    this.updateRowStates();
  }

  private shownIndexOf(pid: number | null): number {
    return pid === null ? -1 : this.shownGroups.findIndex((group) => group.pid === pid);
  }

  private selectOnly(pid: number): void {
    this.selectedPids = new Set([pid]);
    this.anchorPid = pid;
    this.focusPid = pid;
    this.lastSelectionIndex = this.shownIndexOf(pid);
  }

  private clearSelection(): void {
    this.selectedPids = new Set();
    this.anchorPid = null;
    this.focusPid = null;
    this.lastSelectionIndex = null;
  }

  private selectFirstWhenNothingIs(): void {
    // SetSelectOnFocus: focusing an unselected table selects its first row.
    if (this.selectedPids.size > 0 || this.shownGroups.length === 0) return;
    this.selectOnly(this.shownGroups[0].pid);
    this.updateRowStates();
  }

  /** A click selects the row's whole process; ⇧ extends from the anchor, ⌘ toggles. */
  private handleRowPress(event: MouseEvent, row: TaskRow): void {
    if (event.button !== 0) return;
    const pid = row.pid;
    const isToggle = event.metaKey || event.ctrlKey;
    if (event.shiftKey && this.anchorPid !== null) {
      const from = this.shownIndexOf(this.anchorPid);
      const to = this.shownIndexOf(pid);
      const range = this.shownGroups
        .slice(Math.min(from, to), Math.max(from, to) + 1)
        .map((group) => group.pid);
      this.selectedPids = new Set(isToggle ? [...this.selectedPids, ...range] : range);
    } else if (isToggle) {
      const selected = new Set(this.selectedPids);
      if (selected.has(pid)) selected.delete(pid);
      else selected.add(pid);
      this.selectedPids = selected;
      this.anchorPid = pid;
    } else {
      this.selectedPids = new Set([pid]);
      this.anchorPid = pid;
    }
    this.focusPid = pid;
    this.lastSelectionIndex = this.shownIndexOf(pid);
    this.bodyElement.focus();
    this.updateRowStates();
  }

  private moveSelectionTo(index: number): void {
    const group = this.shownGroups[index];
    if (!group) return;
    this.selectOnly(group.pid);
    this.updateRowStates();
    this.scrollGroupIntoView(group.pid);
  }

  private scrollGroupIntoView(pid: number): void {
    this.rowElementsByPid.get(pid)?.[0]?.scrollIntoView({ block: "nearest" });
  }

  /** Double-click or Return: the row's page comes forward in its column-3 tab. */
  private activateRow(row: TaskRow): void {
    if (row.browserId) this.bridge.activate(row.browserId);
  }

  private handleTableKey(event: KeyboardEvent): void {
    const index = this.shownIndexOf(this.focusPid);
    const last = this.shownGroups.length - 1;
    const isJumpToEnd = event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown");
    if (event.key === "Home" || (isJumpToEnd && event.key === "ArrowUp")) {
      event.preventDefault();
      this.moveSelectionTo(0);
      return;
    }
    if (event.key === "End" || (isJumpToEnd && event.key === "ArrowDown")) {
      event.preventDefault();
      this.moveSelectionTo(last);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveSelectionTo(Math.min(index + 1, last));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      // Above the first row the selection clears, as focus moves to the header.
      if (index <= 0) {
        this.clearSelection();
        this.updateRowStates();
        return;
      }
      this.moveSelectionTo(index - 1);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      this.selectedPids = new Set(this.shownGroups.map((group) => group.pid));
      this.updateRowStates();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = this.shownGroups[index]?.rows.find((candidate) => candidate.browserId);
      if (row) this.activateRow(row);
    }
  }

  private handleWindowKey(event: KeyboardEvent): void {
    const isCategoryArrow =
      this.tabsElement.contains(this.document.activeElement) &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight");
    if (isCategoryArrow) {
      event.preventDefault();
      this.cycleCategory(event.key === "ArrowRight" ? 1 : -1);
      this.tabElements.get(this.view.category)?.focus();
      return;
    }
    const isControlW = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w";
    if (event.key === "Escape" || isControlW) {
      event.preventDefault();
      this.bridge.close();
      return;
    }
    if (event.ctrlKey && event.key === "Tab") {
      event.preventDefault();
      this.cycleCategory(event.shiftKey ? -1 : 1);
    }
  }

  private selectedRows(): TaskRow[] {
    return this.shownGroups
      .filter((group) => this.selectedPids.has(group.pid))
      .flatMap((group) => group.rows);
  }

  private updateEndButton(): void {
    const rows = this.selectedRows();
    this.endButton.disabled =
      this.isEndingTasks || rows.length === 0 || !rows.every((row) => row.isKillable);
    this.endButton.setAttribute("aria-busy", String(this.isEndingTasks));
  }

  private async endSelectedTasks(): Promise<void> {
    if (this.endButton.disabled || this.isEndingTasks) return;
    const pids = this.shownGroups
      .filter((group) => this.selectedPids.has(group.pid))
      .map((group) => group.pid);
    if (pids.length === 0) return;
    this.isEndingTasks = true;
    this.liveRegion.textContent = "";
    this.updateEndButton();
    try {
      const isEveryTaskEnded = await this.bridge.endTasks(pids);
      this.liveRegion.textContent = isEveryTaskEnded
        ? this.strings.tasksEnded
        : this.strings.tasksNotEnded;
    } catch {
      // IPC rejection is a failed user action, reported in the window so it can be retried.
      this.liveRegion.textContent = this.strings.tasksNotEnded;
    } finally {
      this.isEndingTasks = false;
      this.updateEndButton();
    }
    // The window stays open with focus in the table.
    this.bodyElement.focus();
  }
}
