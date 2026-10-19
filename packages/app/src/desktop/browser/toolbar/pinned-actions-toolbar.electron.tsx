import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PRODUCT_NAME } from "@/constants/product";
import { ChromeToolbarButton, ChromeToolbarDivider } from "../chrome-controls";
import { ChromeIcon } from "../chrome-icons";
import { CHROME_LAYOUT, chromeColorProps } from "../chrome-theme";
import { DownloadsToolbarButton, useDownloadsButton } from "../downloads/toolbar-button.electron";
import { menuAnchorBelow } from "../menu-anchor.electron";
import { chooseFromPinMenu, PINNABLE_ACTION_PRESENTATION } from "./actions";
import {
  PINNED_ACTION_DRAG_TYPE,
  usePinnedButtonDrag,
  type PinnedButtonDragHandlers,
} from "./pinned-button-drag.electron";
import {
  knownPinnedActions,
  useBrowserToolbarSettingsStore,
  type BrowserPinnableAction,
} from "./settings";

// The downloads button carries its own bubble; the others run one command.
const DOWNLOADS_ACTION = "kActionShowDownloads";

/** The shown order while `action` is dragged to `toIndex`. */
function orderWhileDragging(
  actions: readonly BrowserPinnableAction[],
  action: BrowserPinnableAction,
  toIndex: number,
): BrowserPinnableAction[] {
  const others = actions.filter((candidate) => candidate !== action);
  others.splice(toIndex, 0, action);
  return others;
}

/**
 * Chrome's pinned-actions container: the pinned buttons in pin order, a divider after them, then
 * buttons that pop out while their feature is in use. Pinned buttons can be dragged into a new
 * order, or moved with ⌘← and ⌘→.
 */
export function BrowserPinnedActionsToolbar({
  browserId,
  isPresented,
  page,
  onShowDownloadsPage,
  isCustomizeChromeOpen,
  onRunAction,
  onToggleCustomizeChrome,
  onCustomizeToolbar,
}: {
  browserId: string;
  /** Only the page on screen opens the downloads bubble. */
  isPresented: boolean;
  /** The page area under the toolbar, where the download-started animation starts. */
  page: HTMLElement | null;
  onShowDownloadsPage: () => void;
  /** Chrome pops a 自定义 Chrome button out while its side panel is open. */
  isCustomizeChromeOpen: boolean;
  onRunAction: (action: BrowserPinnableAction) => void;
  onToggleCustomizeChrome: () => void;
  /** 自定义工具栏 in a button's menu: Customize Chrome on its 工具栏 page. */
  onCustomizeToolbar: () => void;
}) {
  const { t } = useTranslation();
  const pinnedActions = useBrowserToolbarSettingsStore((state) => state.pinnedActions);
  const movePinnedAction = useBrowserToolbarSettingsStore((state) => state.movePinnedAction);
  const setActionPinned = useBrowserToolbarSettingsStore((state) => state.setActionPinned);
  const shownActions = useMemo(() => knownPinnedActions(pinnedActions), [pinnedActions]);
  const [drag, setDrag] = useState<{
    action: BrowserPinnableAction;
    dropIndex: number | null;
  } | null>(null);
  const orderedActions = useMemo(() => {
    if (!drag || drag.dropIndex === null) {
      return shownActions;
    }
    return orderWhileDragging(shownActions, drag.action, drag.dropIndex);
  }, [drag, shownActions]);

  const containerRef = useRef<View | null>(null);
  const buttonNodesRef = useRef(new Map<BrowserPinnableAction, HTMLElement>());
  const registerButtonNode = useCallback(
    (action: BrowserPinnableAction, node: HTMLElement | null) => {
      if (node) {
        buttonNodesRef.current.set(action, node);
      } else {
        buttonNodesRef.current.delete(action);
      }
    },
    [],
  );

  // The dragged button's slot moves each time the pointer passes the middle of another pinned
  // button; dropping inside the container keeps the order, anywhere else restores it.
  useEffect(() => {
    const node: unknown = containerRef.current;
    if (!drag || !(node instanceof HTMLElement)) {
      return;
    }
    const container = node;
    const draggedAction = drag.action;
    function dropIndexAt(clientX: number): number {
      let dropIndex = 0;
      for (const action of orderedActions) {
        const button = buttonNodesRef.current.get(action);
        if (action === draggedAction || !button) {
          continue;
        }
        const bounds = button.getBoundingClientRect();
        if (clientX > bounds.left + bounds.width / 2) {
          dropIndex += 1;
        }
      }
      return dropIndex;
    }
    function isPinnedActionDrag(event: DragEvent): boolean {
      return event.dataTransfer?.types.includes(PINNED_ACTION_DRAG_TYPE) ?? false;
    }
    function handleDragOver(event: DragEvent) {
      if (!isPinnedActionDrag(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      const dropIndex = dropIndexAt(event.clientX);
      setDrag((current) =>
        current && current.dropIndex !== dropIndex ? { ...current, dropIndex } : current,
      );
    }
    function handleDragLeave(event: DragEvent) {
      if (event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) {
        return;
      }
      setDrag((current) => (current ? { ...current, dropIndex: null } : current));
    }
    function handleDrop(event: DragEvent) {
      if (!isPinnedActionDrag(event)) {
        return;
      }
      event.preventDefault();
      movePinnedAction(draggedAction, dropIndexAt(event.clientX));
      setDrag(null);
    }
    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("dragleave", handleDragLeave);
    container.addEventListener("drop", handleDrop);
    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("dragleave", handleDragLeave);
      container.removeEventListener("drop", handleDrop);
    };
  }, [drag, movePinnedAction, orderedActions]);

  const handleDragStart = useCallback((action: BrowserPinnableAction) => {
    setDrag({ action, dropIndex: null });
  }, []);
  const handleDragEnd = useCallback(() => setDrag(null), []);
  const handleMoveByKey = useCallback(
    (action: BrowserPinnableAction, step: -1 | 1) => {
      const index = shownActions.indexOf(action);
      const toIndex = index + step;
      if (index < 0 || toIndex < 0 || toIndex >= shownActions.length) {
        return;
      }
      movePinnedAction(action, toIndex);
    },
    [movePinnedAction, shownActions],
  );
  const handleUnpin = useCallback(
    (action: BrowserPinnableAction) => setActionPinned(action, false),
    [setActionPinned],
  );
  const dragHandlers = useMemo<PinnedButtonDragHandlers>(
    () => ({
      onNode: registerButtonNode,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onMoveByKey: handleMoveByKey,
    }),
    [handleDragEnd, handleDragStart, handleMoveByKey, registerButtonNode],
  );
  const downloads = useDownloadsButton();
  const isDownloadsPinned = shownActions.includes(DOWNLOADS_ACTION);
  const isDownloadsPoppedOut = !isDownloadsPinned && downloads.state.isShown;

  if (shownActions.length === 0 && !isCustomizeChromeOpen && !isDownloadsPoppedOut) {
    return null;
  }
  const downloadsButton = (pinnedHandlers: PinnedButtonDragHandlers | null) => (
    <DownloadsToolbarButton
      key={DOWNLOADS_ACTION}
      state={downloads.state}
      browserId={browserId}
      isPresented={isPresented}
      page={page}
      dragHandlers={pinnedHandlers}
      isDragged={drag?.action === DOWNLOADS_ACTION}
      onShowDownloadsPage={onShowDownloadsPage}
      onCustomizeToolbar={onCustomizeToolbar}
    />
  );
  const customizeChromeName = t("workspace.browser.customizeChrome.title", {
    product: PRODUCT_NAME,
  });
  return (
    <View ref={containerRef} style={styles.container}>
      {orderedActions.map((action) =>
        action === DOWNLOADS_ACTION ? (
          downloadsButton(dragHandlers)
        ) : (
          <PinnedActionButton
            key={action}
            action={action}
            isDragged={drag?.action === action}
            onRun={onRunAction}
            onUnpin={handleUnpin}
            onCustomizeToolbar={onCustomizeToolbar}
            dragHandlers={dragHandlers}
          />
        ),
      )}
      {shownActions.length > 0 ? <ChromeToolbarDivider /> : null}
      {isDownloadsPoppedOut ? downloadsButton(null) : null}
      {isCustomizeChromeOpen ? (
        <PoppedOutButton
          label={customizeChromeName}
          onPress={onToggleCustomizeChrome}
          onCustomizeToolbar={onCustomizeToolbar}
        />
      ) : null}
    </View>
  );
}

function PinnedActionButton({
  action,
  isDragged,
  onRun,
  onUnpin,
  onCustomizeToolbar,
  dragHandlers,
}: {
  action: BrowserPinnableAction;
  isDragged: boolean;
  onRun: (action: BrowserPinnableAction) => void;
  onUnpin: (action: BrowserPinnableAction) => void;
  onCustomizeToolbar: () => void;
  dragHandlers: PinnedButtonDragHandlers;
}) {
  const { t } = useTranslation();
  const presentation = PINNABLE_ACTION_PRESENTATION[action];
  const name = t(presentation.labelKey);
  const buttonRef = useRef<View | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  usePinnedButtonDrag(action, buttonRef, dragHandlers);

  const handlePress = useCallback(() => onRun(action), [action, onRun]);
  // The button stays pressed while its menu is open.
  const showMenu = useCallback(async () => {
    setIsMenuOpen(true);
    const choice = await chooseFromPinMenu({
      t,
      isPinned: true,
      isPinnable: true,
      anchor: menuAnchorBelow(buttonRef.current),
    });
    setIsMenuOpen(false);
    if (choice === "unpin") {
      onUnpin(action);
    }
    if (choice === "customizeToolbar") {
      onCustomizeToolbar();
    }
  }, [action, onCustomizeToolbar, onUnpin, t]);
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      void showMenu();
    },
    [showMenu],
  );
  return (
    <ChromeToolbarButton
      ref={buttonRef}
      label={t("workspace.browser.toolbarActions.pinnedName", { name })}
      tooltip={name}
      isActive={isMenuOpen}
      onPress={handlePress}
      onContextMenu={handleContextMenu}
      testID={`browser-pinned-${action}`}
    >
      <View style={isDragged ? styles.draggedIcon : undefined}>
        <ThemedChromeIcon
          name={presentation.icon}
          size={CHROME_LAYOUT.toolbarIconSize}
          uniProps={toolbarIconMapping}
        />
      </View>
    </ChromeToolbarButton>
  );
}

/** A button Chrome shows only while its feature is in use; Customize Chrome can't be pinned. */
function PoppedOutButton({
  label,
  onPress,
  onCustomizeToolbar,
}: {
  label: string;
  onPress: () => void;
  onCustomizeToolbar: () => void;
}) {
  const { t } = useTranslation();
  const buttonRef = useRef<View | null>(null);
  const showMenu = useCallback(async () => {
    const choice = await chooseFromPinMenu({
      t,
      isPinned: false,
      isPinnable: false,
      anchor: menuAnchorBelow(buttonRef.current),
    });
    if (choice === "customizeToolbar") {
      onCustomizeToolbar();
    }
  }, [onCustomizeToolbar, t]);
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      void showMenu();
    },
    [showMenu],
  );
  return (
    <ChromeToolbarButton
      ref={buttonRef}
      label={label}
      isActive
      onPress={onPress}
      onContextMenu={handleContextMenu}
      testID="browser-customize-chrome-button"
    >
      <ThemedChromeIcon
        name="customizeChrome"
        size={CHROME_LAYOUT.toolbarIconSize}
        uniProps={toolbarIconMapping}
      />
    </ChromeToolbarButton>
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const toolbarIconMapping = chromeColorProps("toolbarIcon");

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_LAYOUT.toolbarButtonSpacing,
  },
  // The dragged button leaves an empty slot where it would drop.
  draggedIcon: {
    opacity: 0,
  },
});
