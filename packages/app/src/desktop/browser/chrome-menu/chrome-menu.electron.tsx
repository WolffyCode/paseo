import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getOverlayRoot, useOverlayLayer, useWebOverlayRegistration } from "@/lib/overlay-root";
import { formatShortcut } from "@/utils/format-shortcut";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { ChromeIcon, type ChromeIconName } from "../chrome-icons";
import { CHROME_FONT_FAMILY, CHROME_LAYOUT, chromeColorProps } from "../chrome-theme";
import { useElementBounds, type ElementBounds } from "../use-element-bounds";
import {
  entryKeys,
  extendTypedPrefix,
  isSelectableEntry,
  nextSelectableIndex,
  prefixMatchIndex,
  type ChromeMenuEntry,
  type TypedPrefix,
} from "./model";

// menu_config.cc: a submenu opens, or a passed-over one closes, after the pointer rests 400 ms.
const SHOW_DELAY_MS = 400;
// Keeps a menu off the window's edges when it has to be moved or cut short to fit.
const SCREEN_EDGE_MARGIN = 8;
// DISTANCE_RELATED_LABEL_HORIZONTAL, between a row's icon and its label.
const ICON_LABEL_SPACING = 8;
// Between a label and its shortcut or submenu arrow, so the two never touch.
const LABEL_TRAILING_GAP = 24;
const SPACING_SEPARATOR_HEIGHT = 4;
// The profile row (app_menu.cc PopulateMenu): a 24 dip avatar, 8 above and below, a rounded tint.
const PROFILE_AVATAR_SIZE = 24;
const PROFILE_ROW_VERTICAL_MARGIN = 8;
const PROFILE_ROW_INSET = 8;
// ZoomView: image buttons padded 15 each side, − and + on a round 28 dip fill, the full-screen
// button 38 wider and unfilled, the percentage padded 2 each side.
const ZOOM_BUTTON_PADDING = 15;
const ZOOM_BUTTON_FILL_SIZE = 28;
const FULLSCREEN_EXTRA_WIDTH = 38;
const ZOOM_LABEL_PADDING = 2;
// Wide enough for the widest preset, 500%.
const ZOOM_LABEL_MIN_WIDTH = 40;

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ROOT_PANEL_KEY = "root";
const NO_ENTRIES: readonly ChromeMenuEntry[] = [];

interface OpenSubmenu {
  id: string;
  /** The row that opened it, where its first row lines up. */
  triggerBounds: ElementBounds;
  /** The menu it hangs from; it opens past this menu's right edge, or left if that won't fit. */
  parentBounds: ElementBounds;
}

/**
 * Chrome's Views menu (ui/views/controls/menu), drawn the way Chrome draws its ⋮ menu on macOS:
 * a rounded white panel hanging from its button, submenus cascading to the side on hover after
 * a rest or at once on a click, ↑↓←→ to move, Return to choose, Escape to back out, and a
 * typed letter to jump.
 *
 * The app's own menus (components/ui/menu) are Helm's design; this one reproduces Chrome's, so
 * it lives with the browser.
 */
export function ChromeMenu({
  anchor,
  entries,
  onSelect,
  onClose,
  testID,
}: {
  anchor: HTMLElement | null;
  entries: readonly ChromeMenuEntry[];
  /**
   * A row or button was chosen. Return true to keep the menu open, as the zoom buttons do so
   * the percentage can be watched while it changes.
   */
  onSelect: (id: string) => boolean | void;
  onClose: () => void;
  testID?: string;
}) {
  const anchorBounds = useElementBounds(anchor);
  const layer = useOverlayLayer("floating");
  const [openSubmenus, setOpenSubmenus] = useState<readonly OpenSubmenu[]>([]);
  const [selection, setSelection] = useState<readonly (number | null)[]>([null]);
  const typedPrefixRef = useRef<TypedPrefix | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelElementsRef = useRef(new Map<number, HTMLElement>());
  const rowElementsRef = useRef(new Map<string, HTMLElement>());

  // Each open level's rows, read from the live entries so a row that changes while open (the
  // zoom percentage) shows its new state; a submenu whose row went away closes.
  const levels = useMemo(() => {
    const result: (readonly ChromeMenuEntry[])[] = [entries];
    for (const submenu of openSubmenus) {
      const parentEntries = result[result.length - 1] ?? [];
      const trigger = parentEntries.find(
        (entry) => entry.kind === "submenu" && entry.id === submenu.id,
      );
      if (!trigger || trigger.kind !== "submenu") {
        break;
      }
      result.push(trigger.entries);
    }
    return result;
  }, [entries, openSubmenus]);

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  useEffect(() => cancelHoverTimer, [cancelHoverTimer]);

  // Chrome closes its menus when the window resizes, rather than chasing the button.
  useEffect(() => {
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, [onClose]);

  const selectRow = useCallback((level: number, index: number | null) => {
    setSelection((current) => {
      const next = current.slice(0, level + 1);
      while (next.length <= level) next.push(null);
      next[level] = index;
      return next;
    });
  }, []);

  const closeSubmenusBelow = useCallback((level: number) => {
    setOpenSubmenus((current) => (current.length > level ? current.slice(0, level) : current));
    setSelection((current) => current.slice(0, level + 1));
  }, []);

  const openSubmenu = useCallback(
    (level: number, index: number, selectFirst: boolean) => {
      const trigger = levels[level]?.[index];
      const rowElement = rowElementsRef.current.get(`${level}:${index}`);
      const panelElement = panelElementsRef.current.get(level);
      if (trigger?.kind !== "submenu" || !rowElement || !panelElement) {
        return;
      }
      const submenu: OpenSubmenu = {
        id: trigger.id,
        triggerBounds: boundsOf(rowElement),
        parentBounds: boundsOf(panelElement),
      };
      setOpenSubmenus((current) => [...current.slice(0, level), submenu]);
      setSelection((current) => {
        const next = current.slice(0, level + 1);
        next[level] = index;
        next.push(selectFirst ? nextSelectableIndex(trigger.entries, null, 1) : null);
        return next;
      });
    },
    [levels],
  );

  const activateRow = useCallback(
    (level: number, index: number, fromKeyboard: boolean) => {
      const entry = levels[level]?.[index];
      if (!entry || !isSelectableEntry(entry)) {
        return;
      }
      cancelHoverTimer();
      if (entry.kind === "submenu") {
        openSubmenu(level, index, fromKeyboard);
        return;
      }
      const keepOpen = onSelect(entry.id) === true;
      if (!keepOpen) onClose();
    },
    [cancelHoverTimer, levels, onClose, onSelect, openSubmenu],
  );

  const handleButton = useCallback(
    (id: string) => {
      const keepOpen = onSelect(id) === true;
      if (!keepOpen) onClose();
    },
    [onClose, onSelect],
  );

  // The pointer on a row selects it at once; opening its submenu, or closing the one another
  // row left open, waits for the pointer to rest, so crossing rows on the way down into an open
  // submenu doesn't swap it.
  const handleRowHover = useCallback(
    (level: number, index: number) => {
      const entry = levels[level]?.[index];
      const isSelectable = Boolean(entry && isSelectableEntry(entry));
      selectRow(level, isSelectable ? index : null);
      cancelHoverTimer();
      const isOpenTrigger = entry?.kind === "submenu" && openSubmenus[level]?.id === entry.id;
      if (isOpenTrigger) {
        return;
      }
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        if (entry?.kind === "submenu") {
          openSubmenu(level, index, false);
          return;
        }
        closeSubmenusBelow(level);
      }, SHOW_DELAY_MS);
    },
    [cancelHoverTimer, closeSubmenusBelow, levels, openSubmenu, openSubmenus, selectRow],
  );

  const handlePanelEnter = useCallback(
    (level: number) => {
      if (level === 0) {
        return;
      }
      // Reaching a submenu keeps it: its trigger stays lit and a pending swap is dropped.
      cancelHoverTimer();
      const triggerId = openSubmenus[level - 1]?.id;
      const triggerIndex = levels[level - 1]?.findIndex(
        (entry) => entry.kind === "submenu" && entry.id === triggerId,
      );
      if (triggerIndex !== undefined && triggerIndex >= 0) {
        setSelection((current) => {
          const next = current.slice();
          next[level - 1] = triggerIndex;
          return next;
        });
      }
    },
    [cancelHoverTimer, levels, openSubmenus],
  );

  const handlePanelLeave = useCallback(
    (level: number) => {
      // A row whose submenu is open stays lit when the pointer leaves; any other row goes dark.
      const selectedIndex = selection[level];
      const selected = selectedIndex == null ? undefined : levels[level]?.[selectedIndex];
      const isOpenTrigger = selected?.kind === "submenu" && openSubmenus[level]?.id === selected.id;
      if (!isOpenTrigger) selectRow(level, null);
    },
    [levels, openSubmenus, selectRow, selection],
  );

  // Keys work in the deepest open menu, as in MenuController.
  const deepestLevel = levels.length - 1;
  const deepestEntries = levels[deepestLevel] ?? NO_ENTRIES;
  const deepestSelection = selection[deepestLevel] ?? null;

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      cancelHoverTimer();
      selectRow(deepestLevel, nextSelectableIndex(deepestEntries, deepestSelection, direction));
    },
    [cancelHoverTimer, deepestEntries, deepestLevel, deepestSelection, selectRow],
  );

  const openSelectedSubmenu = useCallback(() => {
    if (deepestSelection === null || deepestEntries[deepestSelection]?.kind !== "submenu") {
      return;
    }
    openSubmenu(deepestLevel, deepestSelection, true);
  }, [deepestEntries, deepestLevel, deepestSelection, openSubmenu]);

  // ← and Escape close the deepest submenu; Escape at the top closes the menu.
  const backOut = useCallback(
    (closesMenu: boolean) => {
      cancelHoverTimer();
      if (deepestLevel > 0) {
        closeSubmenusBelow(deepestLevel - 1);
        return;
      }
      if (closesMenu) onClose();
    },
    [cancelHoverTimer, closeSubmenusBelow, deepestLevel, onClose],
  );

  const selectByTypedLetter = useCallback(
    (key: string) => {
      const prefix = extendTypedPrefix(typedPrefixRef.current, key, Date.now());
      typedPrefixRef.current = prefix;
      const match = prefixMatchIndex(deepestEntries, deepestSelection, prefix.text);
      if (match !== null) selectRow(deepestLevel, match);
    },
    [deepestEntries, deepestLevel, deepestSelection, selectRow],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      switch (event.key) {
        case "ArrowDown":
          moveSelection(1);
          return true;
        case "ArrowUp":
          moveSelection(-1);
          return true;
        case "ArrowRight":
          openSelectedSubmenu();
          return true;
        case "ArrowLeft":
          backOut(false);
          return true;
        case "Escape":
          backOut(true);
          return true;
        case "Enter":
        case " ":
          if (deepestSelection !== null) activateRow(deepestLevel, deepestSelection, true);
          return true;
        default:
          break;
      }
      const isTypedLetter =
        event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (isTypedLetter) selectByTypedLetter(event.key);
      return isTypedLetter;
    },
    [
      activateRow,
      backOut,
      deepestLevel,
      deepestSelection,
      moveSelection,
      openSelectedSubmenu,
      selectByTypedLetter,
    ],
  );

  const setOverlayScope = useWebOverlayRegistration({
    active: true,
    layer,
    manageFocus: false,
    onKeyDown: handleKeyDown,
  });
  // Keys reach the menu only while the window has focus; a click on the ⋮ button may leave it
  // with the page, so the menu takes it.
  const focusLayer = useCallback(
    (node: unknown) => {
      setOverlayScope(node);
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.tabIndex = -1;
      node.focus({ preventScroll: true });
    },
    [setOverlayScope],
  );
  const rootPlacement = useMemo(
    () => (anchorBounds ? { anchor: anchorBounds } : undefined),
    [anchorBounds],
  );

  const registerPanel = useCallback((level: number, element: HTMLElement | null) => {
    if (element) {
      panelElementsRef.current.set(level, element);
    } else {
      panelElementsRef.current.delete(level);
    }
  }, []);
  const registerRow = useCallback((key: string, element: HTMLElement | null) => {
    if (element) {
      rowElementsRef.current.set(key, element);
    } else {
      rowElementsRef.current.delete(key);
    }
  }, []);

  if (!anchorBounds) {
    return null;
  }
  return createPortal(
    <View
      ref={focusLayer}
      style={[styles.layer, { zIndex: layer }]}
      // The overlay root lets clicks through to the page; the menu and its backdrop take them.
      pointerEvents="box-none"
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPressIn={onClose} accessibilityElementsHidden />
      {levels.map((levelEntries, level) => (
        <MenuPanel
          key={level === 0 ? ROOT_PANEL_KEY : openSubmenus[level - 1]?.id}
          level={level}
          entries={levelEntries}
          placement={level === 0 ? rootPlacement : openSubmenus[level - 1]}
          selectedIndex={selection[level] ?? null}
          openSubmenuId={openSubmenus[level]?.id ?? null}
          onRowHover={handleRowHover}
          onRowPress={activateRow}
          onButton={handleButton}
          onPanelEnter={handlePanelEnter}
          onPanelLeave={handlePanelLeave}
          registerPanel={registerPanel}
          registerRow={registerRow}
        />
      ))}
    </View>,
    getOverlayRoot(),
  );
}

function boundsOf(element: HTMLElement): ElementBounds {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

type PanelPlacement = { anchor: ElementBounds } | OpenSubmenu | undefined;

/**
 * Where a menu goes once its size is known. The ⋮ menu hangs from its button's bottom, its right
 * edge on the button's; a submenu opens to the right with its first row level with its trigger,
 * flipping left or rising to stay in the window. Too tall a menu is cut short and scrolls.
 */
function placePanel(placement: PanelPlacement, size: { width: number; height: number }) {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  if (!placement) {
    return { left: 0, top: 0, maxHeight: windowHeight };
  }
  if ("anchor" in placement) {
    const { anchor } = placement;
    const top = anchor.top + anchor.height;
    const left = Math.max(SCREEN_EDGE_MARGIN, anchor.left + anchor.width - size.width);
    return { left, top, maxHeight: windowHeight - top - SCREEN_EDGE_MARGIN };
  }
  const { parentBounds, triggerBounds } = placement;
  const rightOfParent = parentBounds.left + parentBounds.width;
  const fitsRight = rightOfParent + size.width <= windowWidth - SCREEN_EDGE_MARGIN;
  const left = fitsRight
    ? rightOfParent
    : Math.max(SCREEN_EDGE_MARGIN, parentBounds.left - size.width);
  const preferredTop = triggerBounds.top - CHROME_LAYOUT.menuVerticalPadding;
  const lowestTop = windowHeight - SCREEN_EDGE_MARGIN - size.height;
  const top = Math.max(SCREEN_EDGE_MARGIN, Math.min(preferredTop, lowestTop));
  return { left, top, maxHeight: windowHeight - top - SCREEN_EDGE_MARGIN };
}

function MenuPanel({
  level,
  entries,
  placement,
  selectedIndex,
  openSubmenuId,
  onRowHover,
  onRowPress,
  onButton,
  onPanelEnter,
  onPanelLeave,
  registerPanel,
  registerRow,
}: {
  level: number;
  entries: readonly ChromeMenuEntry[];
  placement: PanelPlacement;
  selectedIndex: number | null;
  openSubmenuId: string | null;
  onRowHover: (level: number, index: number) => void;
  onRowPress: (level: number, index: number, fromKeyboard: boolean) => void;
  onButton: (id: string) => void;
  onPanelEnter: (level: number) => void;
  onPanelLeave: (level: number) => void;
  registerPanel: (level: number, element: HTMLElement | null) => void;
  registerRow: (key: string, element: HTMLElement | null) => void;
}) {
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(
    null,
  );
  const panelRef = useRef<HTMLElement | null>(null);
  const setPanelNode = useCallback(
    (node: unknown) => {
      const element = node instanceof HTMLElement ? node : null;
      panelRef.current = element;
      registerPanel(level, element);
    },
    [level, registerPanel],
  );

  // Measured before paint, so the menu never shows at a spot it then leaves. Rows that change
  // while open (the zoom percentage) can change the size, so it is measured again then.
  useLayoutEffect(() => {
    const element = panelRef.current;
    if (!element) {
      return;
    }
    const next = placePanel(placement, {
      width: element.offsetWidth,
      height: element.scrollHeight,
    });
    setPosition((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.maxHeight === next.maxHeight
        ? current
        : next,
    );
  }, [entries, placement]);

  // Views lines up every row's label after the widest icon in the menu, iconless rows included.
  const iconColumnWidth = useMemo(() => {
    const hasIcons = entries.some(
      (entry) => (entry.kind === "item" || entry.kind === "submenu") && entry.icon,
    );
    return hasIcons ? CHROME_LAYOUT.menuIconSize + ICON_LABEL_SPACING : 0;
  }, [entries]);

  const rowKeys = useMemo(() => entryKeys(entries), [entries]);
  const handlePointerEnter = useCallback(() => onPanelEnter(level), [level, onPanelEnter]);
  const handlePointerLeave = useCallback(() => onPanelLeave(level), [level, onPanelLeave]);
  const positionStyle = useMemo(
    () =>
      position
        ? { left: position.left, top: position.top, maxHeight: position.maxHeight }
        : { left: 0, top: 0, opacity: 0 },
    [position],
  );

  return (
    <View
      ref={setPanelNode}
      role="menu"
      style={[styles.panel, positionStyle]}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* A menu taller than the window is cut short and scrolls. */}
      <ScrollView style={styles.panelScroller} contentContainerStyle={styles.panelContent}>
        {entries.map((entry, index) => (
          <MenuRow
            key={rowKeys[index]}
            level={level}
            index={index}
            entry={entry}
            iconColumnWidth={iconColumnWidth}
            isSelected={selectedIndex === index}
            isSubmenuOpen={entry.kind === "submenu" && entry.id === openSubmenuId}
            onHover={onRowHover}
            onPress={onRowPress}
            onButton={onButton}
            registerRow={registerRow}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function MenuRow({
  level,
  index,
  entry,
  iconColumnWidth,
  isSelected,
  isSubmenuOpen,
  onHover,
  onPress,
  onButton,
  registerRow,
}: {
  level: number;
  index: number;
  entry: ChromeMenuEntry;
  iconColumnWidth: number;
  isSelected: boolean;
  isSubmenuOpen: boolean;
  onHover: (level: number, index: number) => void;
  onPress: (level: number, index: number, fromKeyboard: boolean) => void;
  onButton: (id: string) => void;
  registerRow: (key: string, element: HTMLElement | null) => void;
}) {
  const rowKey = `${level}:${index}`;
  const setRowNode = useCallback(
    (node: unknown) => registerRow(rowKey, node instanceof HTMLElement ? node : null),
    [registerRow, rowKey],
  );
  const handlePointerEnter = useCallback(() => onHover(level, index), [index, level, onHover]);
  const handlePress = useCallback(() => onPress(level, index, false), [index, level, onPress]);
  const labelInset = useMemo(() => ({ paddingLeft: iconColumnWidth }), [iconColumnWidth]);

  if (entry.kind === "separator") {
    return (
      <View style={styles.separatorRow} onPointerEnter={handlePointerEnter}>
        <View style={styles.separatorLine} />
      </View>
    );
  }
  if (entry.kind === "spacing") {
    return <View style={styles.spacingRow} onPointerEnter={handlePointerEnter} />;
  }
  if (entry.kind === "title") {
    return (
      <View style={styles.row} onPointerEnter={handlePointerEnter}>
        <Text numberOfLines={1} style={[styles.titleText, labelInset]}>
          {entry.label}
        </Text>
      </View>
    );
  }
  if (entry.kind === "zoom") {
    return (
      <View style={styles.row} onPointerEnter={handlePointerEnter}>
        <Text numberOfLines={1} style={[styles.label, labelInset]}>
          {entry.label}
        </Text>
        <ZoomControls entry={entry} onButton={onButton} />
      </View>
    );
  }
  return (
    <View
      ref={setRowNode}
      onPointerEnter={handlePointerEnter}
      style={entry.kind === "submenu" && entry.isProfileRow ? styles.profileRowFrame : null}
    >
      <ActionRow
        entry={entry}
        labelInset={labelInset}
        isSelected={isSelected}
        isSubmenuOpen={isSubmenuOpen}
        onPress={handlePress}
      />
    </View>
  );
}

/** The zoom row's − percentage + and full-screen buttons (AppMenu::ZoomView). */
function ZoomControls({
  entry,
  onButton,
}: {
  entry: Extract<ChromeMenuEntry, { kind: "zoom" }>;
  onButton: (id: string) => void;
}) {
  return (
    <View style={styles.zoomControls}>
      <ZoomButton
        id={entry.zoomOutId}
        icon="menuZoomOut"
        label={entry.zoomOutLabel}
        isEnabled={entry.canZoomOut}
        onPress={onButton}
      />
      <Text style={styles.zoomPercent} role="alert">
        {`${entry.percent}%`}
      </Text>
      <ZoomButton
        id={entry.zoomInId}
        icon="menuZoomIn"
        label={entry.zoomInLabel}
        isEnabled={entry.canZoomIn}
        onPress={onButton}
      />
      <ZoomButton
        id={entry.fullscreenId}
        icon="menuFullscreen"
        label={entry.fullscreenLabel}
        isEnabled
        isFullscreen
        onPress={onButton}
      />
    </View>
  );
}

/** A row that does something: a command, or a submenu it opens. */
function ActionRow({
  entry,
  labelInset,
  isSelected,
  isSubmenuOpen,
  onPress,
}: {
  entry: Extract<ChromeMenuEntry, { kind: "item" | "submenu" }>;
  labelInset: { paddingLeft: number };
  isSelected: boolean;
  isSubmenuOpen: boolean;
  onPress: () => void;
}) {
  const isEnabled = entry.kind === "submenu" || entry.isEnabled !== false;
  const isLit = isEnabled && (isSelected || isSubmenuOpen);
  const isProfileRow = entry.kind === "submenu" && entry.isProfileRow === true;
  const shortcut =
    entry.kind === "item" && entry.shortcut
      ? formatShortcut([...entry.shortcut], getShortcutOs())
      : null;

  return (
    <Pressable
      role="menuitem"
      aria-haspopup={entry.kind === "submenu" ? "menu" : undefined}
      aria-expanded={entry.kind === "submenu" ? isSubmenuOpen : undefined}
      disabled={!isEnabled}
      onPress={onPress}
      style={[
        styles.row,
        isProfileRow && styles.profileRow,
        isLit && (isProfileRow ? styles.profileRowLit : styles.rowLit),
      ]}
      testID={`chrome-menu-${entry.id}`}
    >
      {entry.icon ? (
        <RowIcon icon={entry.icon} isProfileRow={isProfileRow} isEnabled={isEnabled} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, !entry.icon && labelInset, !isEnabled && styles.labelDisabled]}
      >
        {entry.label}
      </Text>
      {shortcut ? (
        <Text
          style={[styles.shortcut, isLit && styles.shortcutLit, !isEnabled && styles.labelDisabled]}
        >
          {shortcut}
        </Text>
      ) : null}
      {entry.kind === "submenu" ? (
        <View style={styles.arrow}>
          <ThemedChromeIcon
            name="menuSubmenuArrow"
            size={CHROME_LAYOUT.menuIconSize}
            uniProps={submenuArrowMapping}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A row's 16 dip icon, or the profile row's 24 dip avatar. */
function RowIcon({
  icon,
  isProfileRow,
  isEnabled,
}: {
  icon: ChromeIconName;
  isProfileRow: boolean;
  isEnabled: boolean;
}) {
  return (
    <View style={[styles.iconSlot, isProfileRow && styles.profileAvatarSlot]}>
      <ThemedChromeIcon
        name={icon}
        size={isProfileRow ? PROFILE_AVATAR_SIZE : CHROME_LAYOUT.menuIconSize}
        uniProps={isEnabled ? menuIconMapping : menuIconDisabledMapping}
      />
    </View>
  );
}

function ZoomButton({
  id,
  icon,
  label,
  isEnabled,
  isFullscreen = false,
  onPress,
}: {
  id: string;
  icon: ChromeIconName;
  label: string;
  isEnabled: boolean;
  isFullscreen?: boolean;
  onPress: (id: string) => void;
}) {
  const handlePress = useCallback(() => onPress(id), [id, onPress]);
  return (
    <Pressable
      role="menuitem"
      accessibilityLabel={label}
      disabled={!isEnabled}
      onPress={handlePress}
      style={isFullscreen ? styles.fullscreenButton : styles.zoomButton}
      testID={`chrome-menu-${id}`}
    >
      {({ hovered }: HoverState) => (
        <>
          {isEnabled && !isFullscreen ? (
            <View style={[styles.zoomButtonFill, hovered && styles.zoomButtonFillHovered]} />
          ) : null}
          {/* A View, so the glyph paints over the positioned fill behind it. */}
          <View>
            <ThemedChromeIcon
              name={icon}
              size={CHROME_LAYOUT.menuIconSize}
              uniProps={isEnabled ? menuTextMapping : menuIconDisabledMapping}
            />
          </View>
        </>
      )}
    </Pressable>
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const menuIconMapping = chromeColorProps("menuIcon");
const menuIconDisabledMapping = chromeColorProps("menuIconDisabled");
const menuTextMapping = chromeColorProps("menuText");
const submenuArrowMapping = chromeColorProps("menuSubmenuArrow");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  const textBase = {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: 13,
    lineHeight: 17,
  } as const;
  return {
    layer: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    backdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    panel: {
      position: "absolute",
      borderRadius: CHROME_LAYOUT.menuCornerRadius,
      backgroundColor: chrome.menu,
      overflow: "hidden",
      boxShadow: `0 0 12px rgba(${chrome.dropdownShadowRgb},0.08), 0 12px 16px rgba(${chrome.dropdownShadowRgb},0.18)`,
      cursor: "auto",
    },
    panelScroller: {
      flexGrow: 0,
      flexShrink: 1,
    },
    panelContent: {
      paddingVertical: CHROME_LAYOUT.menuVerticalPadding,
    },
    row: {
      height: CHROME_LAYOUT.menuItemHeight,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: CHROME_LAYOUT.menuItemHorizontalPadding,
      cursor: "auto",
    },
    rowLit: {
      backgroundColor: chrome.menuHovered,
    },
    profileRowFrame: {
      paddingHorizontal: PROFILE_ROW_INSET,
    },
    profileRow: {
      height: PROFILE_AVATAR_SIZE + PROFILE_ROW_VERTICAL_MARGIN * 2,
      paddingHorizontal: CHROME_LAYOUT.menuItemHorizontalPadding - PROFILE_ROW_INSET,
      borderRadius: CHROME_LAYOUT.menuCornerRadius,
      backgroundColor: chrome.menuProfileRow,
    },
    profileRowLit: {
      backgroundColor: chrome.menuProfileRowHovered,
    },
    iconSlot: {
      width: CHROME_LAYOUT.menuIconSize,
      height: CHROME_LAYOUT.menuIconSize,
      marginRight: ICON_LABEL_SPACING,
      alignItems: "center",
      justifyContent: "center",
    },
    profileAvatarSlot: {
      width: PROFILE_AVATAR_SIZE,
      height: PROFILE_AVATAR_SIZE,
    },
    label: {
      ...textBase,
      flexGrow: 1,
      flexShrink: 0,
      color: chrome.menuText,
    },
    labelDisabled: {
      color: chrome.menuDisabled,
    },
    titleText: {
      ...textBase,
      color: chrome.menuShortcut,
    },
    shortcut: {
      ...textBase,
      marginLeft: LABEL_TRAILING_GAP,
      color: chrome.menuShortcut,
    },
    shortcutLit: {
      color: chrome.menuText,
    },
    arrow: {
      marginLeft: LABEL_TRAILING_GAP,
      width: CHROME_LAYOUT.menuIconSize,
      height: CHROME_LAYOUT.menuIconSize,
    },
    separatorRow: {
      height: CHROME_LAYOUT.menuSeparatorHeight,
      justifyContent: "center",
    },
    separatorLine: {
      height: 1,
      backgroundColor: chrome.menuSeparator,
    },
    spacingRow: {
      height: SPACING_SEPARATOR_HEIGHT,
    },
    zoomControls: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      marginLeft: LABEL_TRAILING_GAP,
      marginRight: -CHROME_LAYOUT.menuItemHorizontalPadding,
    },
    zoomButton: {
      alignSelf: "stretch",
      paddingHorizontal: ZOOM_BUTTON_PADDING,
      alignItems: "center",
      justifyContent: "center",
      cursor: "auto",
    },
    fullscreenButton: {
      alignSelf: "stretch",
      width: CHROME_LAYOUT.menuIconSize + ZOOM_BUTTON_PADDING * 2 + FULLSCREEN_EXTRA_WIDTH,
      alignItems: "center",
      justifyContent: "center",
      cursor: "auto",
    },
    zoomButtonFill: {
      position: "absolute",
      width: ZOOM_BUTTON_FILL_SIZE,
      height: ZOOM_BUTTON_FILL_SIZE,
      borderRadius: ZOOM_BUTTON_FILL_SIZE / 2,
      backgroundColor: chrome.menuZoomButton,
    },
    zoomButtonFillHovered: {
      backgroundColor: chrome.menuHovered,
    },
    zoomPercent: {
      ...textBase,
      minWidth: ZOOM_LABEL_MIN_WIDTH + ZOOM_LABEL_PADDING * 2,
      paddingHorizontal: ZOOM_LABEL_PADDING,
      textAlign: "right",
      color: chrome.menuText,
    },
  };
});
