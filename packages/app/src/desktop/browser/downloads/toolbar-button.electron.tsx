import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { createPortal } from "react-dom";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DesktopBrowserDownload } from "@/desktop/host";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { ChromeToolbarButton } from "../chrome-controls";
import { ChromeIcon } from "../chrome-icons";
import { CHROME_LAYOUT, chromeColorProps } from "../chrome-theme";
import { menuAnchorBelow } from "../menu-anchor.electron";
import { chooseFromPinMenu } from "../toolbar/actions";
import {
  usePinnedButtonDrag,
  type PinnedButtonDragHandlers,
} from "../toolbar/pinned-button-drag.electron";
import { useBrowserToolbarSettingsStore } from "../toolbar/settings";
import { DownloadBubble, type DownloadBubbleView } from "./bubble.electron";
import {
  bubbleDownloads,
  downloadButtonState,
  nextButtonChangeAt,
  type DownloadButtonState,
} from "./display";
import { useBrowserDownloadsStore } from "./store";
import { canShowPartialView, useDownloadsUiStore } from "./ui-state";

const DOWNLOADS_ACTION = "kActionShowDownloads";
// download_button_views.cc: the ring circles the 34-dip button's middle at radius 9, 2 wide.
const BUTTON_SIZE = CHROME_LAYOUT.toolbarButtonSize;
const BUTTON_CENTER = BUTTON_SIZE / 2;
const RING_RADIUS = 9;
const RING_STROKE = 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const FULL_PERCENT = 100;
// The spinner turns once every 2.5 s: three 60° arcs with three 60° gaps.
const SPINNER_TURN_MS = 2500;
const SPINNER_ARC = RING_CIRCUMFERENCE / 6;
// Above nine running downloads the badge reads "9+".
const BADGE_MAX_COUNT = 9;
// pinned_toolbar_actions_container.cc: a popped-out button slides in over 300 ms and fades in
// over 200 ms.
const SLIDE_IN_MS = 300;
const FADE_IN_MS = 200;
const SLIDE_IN_EASING = "cubic-bezier(0.2, 0, 0, 1)";
// download_bubble_started_animation_views.cc: a 64-dip circle with the 26-dip arrow, 500 ms in two
// phases split at 60 %, skipped on pages shorter than 104 dip.
const STARTED_CIRCLE_SIZE = 64;
const STARTED_ICON_SIZE = 26;
const STARTED_MS = 500;
const STARTED_SPLIT = 0.6;
const STARTED_STOP_BELOW_BUTTON = 40;
const STARTED_MIN_PAGE_HEIGHT = 104;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The downloads button's look, refreshed when a download changes or Chrome's timers run out. */
export function useDownloadsButton(): {
  state: DownloadButtonState;
  rows: DesktopBrowserDownload[];
} {
  const downloads = useBrowserDownloadsStore((state) => state.downloads);
  const actionedIds = useDownloadsUiStore((state) => state.actionedIds);
  // The clock moves only at the timers' deadlines: a download that changes after it is still
  // judged correctly, since every comparison is against when it finished.
  const [now, setNow] = useState(() => Date.now());
  const rows = useMemo(() => bubbleDownloads(downloads, now), [downloads, now]);
  const state = useMemo(
    () => downloadButtonState({ rows, now, actionedIds }),
    [actionedIds, now, rows],
  );
  const nextChangeAt = nextButtonChangeAt(rows, now);
  useEffect(() => {
    if (nextChangeAt === null) {
      return;
    }
    const timer = setTimeout(
      () => setNow(Math.max(Date.now(), nextChangeAt)),
      nextChangeAt - Date.now(),
    );
    return () => clearTimeout(timer);
  }, [nextChangeAt]);
  return { state, rows };
}

function tooltipText(state: DownloadButtonState, t: TFunction): string {
  const { tooltip } = state;
  if (tooltip.kind === "inProgress") {
    return tooltip.count === 1
      ? t("workspace.browser.downloads.tooltipInProgressOne")
      : t("workspace.browser.downloads.tooltipInProgressOther", { count: tooltip.count });
  }
  if (tooltip.kind === "newDownload") {
    return t("workspace.browser.downloads.tooltipNewDownload");
  }
  return t("workspace.browser.downloads.name");
}

/**
 * Chrome's downloads button: an arrow in a progress ring while files download, the tray when
 * they are done, a count badge for two or more, and the bubble below it. Pinned it sits with the
 * pinned buttons; otherwise it pops out while there are recent downloads.
 */
export function DownloadsToolbarButton({
  state,
  browserId,
  isPresented,
  page,
  dragHandlers,
  isDragged,
  onShowDownloadsPage,
  onCustomizeToolbar,
}: {
  state: DownloadButtonState;
  browserId: string;
  /** Only the page on screen opens bubbles and plays the started animation. */
  isPresented: boolean;
  /** The page area the started animation rises from. */
  page: HTMLElement | null;
  /** Set when pinned: the button joins the pinned buttons' drag and key reordering. */
  dragHandlers: PinnedButtonDragHandlers | null;
  isDragged: boolean;
  onShowDownloadsPage: () => void;
  onCustomizeToolbar: () => void;
}) {
  const { t } = useTranslation();
  const buttonRef = useRef<View | null>(null);
  const [bubbleView, setBubbleView] = useState<DownloadBubbleView | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isPinned = dragHandlers !== null;
  const setActionPinned = useBrowserToolbarSettingsStore((settings) => settings.setActionPinned);
  usePinnedButtonDrag(DOWNLOADS_ACTION, buttonRef, dragHandlers);

  const closeBubble = useCallback(() => setBubbleView(null), []);
  const showFullHistory = useCallback(() => {
    setBubbleView(null);
    onShowDownloadsPage();
  }, [onShowDownloadsPage]);
  useEffect(() => {
    if (!isPresented) closeBubble();
  }, [closeBubble, isPresented]);

  // download_toolbar_ui_controller.cc: a click opens the full bubble when it has rows and the
  // downloads page otherwise; a click while the bubble is open only closes it.
  const handlePress = useCallback(() => {
    if (bubbleView) {
      closeBubble();
      return;
    }
    const rows = bubbleDownloads(useBrowserDownloadsStore.getState().downloads, Date.now());
    if (rows.length === 0) {
      onShowDownloadsPage();
      return;
    }
    const finishedIds = rows.filter((row) => row.state !== "in_progress").map((row) => row.id);
    useDownloadsUiStore.getState().markViewed(finishedIds);
    setBubbleView("main");
  }, [bubbleView, closeBubble, onShowDownloadsPage]);

  // The main process asks the last-active window to show what finished; Chrome opens the partial
  // bubble, at most once every 15 s, with the downloads nobody has seen in the full bubble.
  const detailsRequestCount = useDownloadsUiStore((ui) => ui.detailsRequestCount);
  const handledDetailsRef = useRef(detailsRequestCount);
  useEffect(() => {
    if (detailsRequestCount === handledDetailsRef.current) {
      return;
    }
    handledDetailsRef.current = detailsRequestCount;
    const now = Date.now();
    const ui = useDownloadsUiStore.getState();
    const unseen = bubbleDownloads(useBrowserDownloadsStore.getState().downloads, now).filter(
      (row) => !ui.actionedIds.has(row.id),
    );
    const canOpen = isPresented && bubbleView === null && unseen.length > 0;
    if (!canOpen || !canShowPartialView(ui.lastPartialViewAt, now)) {
      return;
    }
    ui.notePartialView(now);
    setBubbleView("partial");
  }, [bubbleView, detailsRequestCount, isPresented]);

  const showMenu = useCallback(async () => {
    setIsMenuOpen(true);
    const choice = await chooseFromPinMenu({
      t,
      isPinned,
      isPinnable: true,
      anchor: menuAnchorBelow(buttonRef.current),
    });
    setIsMenuOpen(false);
    if (choice === "pin" || choice === "unpin") {
      setActionPinned(DOWNLOADS_ACTION, choice === "pin");
    }
    if (choice === "customizeToolbar") {
      onCustomizeToolbar();
    }
  }, [isPinned, onCustomizeToolbar, setActionPinned, t]);
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      void showMenu();
    },
    [showMenu],
  );

  const name = t("workspace.browser.downloads.name");
  const anchor: unknown = buttonRef.current;
  return (
    <SlideIn isAnimated={!isPinned}>
      <ChromeToolbarButton
        ref={buttonRef}
        label={isPinned ? t("workspace.browser.toolbarActions.pinnedName", { name }) : name}
        tooltip={tooltipText(state, t)}
        isActive={bubbleView === "main" || isMenuOpen}
        onPress={handlePress}
        onContextMenu={handleContextMenu}
        testID="browser-downloads-button"
      >
        <View style={[styles.face, isDragged && styles.dragged]}>
          {state.ring ? <ProgressRing state={state} /> : null}
          <ThemedChromeIcon
            name={state.icon === "inProgress" ? "downloadInProgress" : "download"}
            size={CHROME_LAYOUT.toolbarIconSize}
            uniProps={state.isActive ? activeIconMapping : idleIconMapping}
          />
          {state.isActive ? <View style={styles.underline} /> : null}
          {state.badgeCount !== null ? <CountBadge count={state.badgeCount} /> : null}
        </View>
      </ChromeToolbarButton>
      {bubbleView ? (
        <DownloadBubble
          anchor={anchor instanceof HTMLElement ? anchor : null}
          view={bubbleView}
          onClose={closeBubble}
          onShowFullHistory={showFullHistory}
        />
      ) : null}
      <StartedAnimation
        browserId={browserId}
        isPresented={isPresented}
        page={page}
        button={buttonRef}
      />
    </SlideIn>
  );
}

/** A popped-out button slides in from the trailing edge while it fades in. */
function SlideIn({ isAnimated, children }: { isAnimated: boolean; children: React.ReactNode }) {
  const wrapperRef = useRef<View | null>(null);
  useLayoutEffect(() => {
    const node: unknown = wrapperRef.current;
    if (!isAnimated || !(node instanceof HTMLElement) || prefersReducedMotion()) {
      return;
    }
    node.animate([{ width: "0px" }, { width: `${BUTTON_SIZE}px` }], {
      duration: SLIDE_IN_MS,
      easing: SLIDE_IN_EASING,
    });
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS });
  }, [isAnimated]);
  return (
    <View ref={wrapperRef} style={styles.slideIn}>
      {children}
    </View>
  );
}

function ProgressRing({ state }: { state: DownloadButtonState }) {
  const spinnerRef = useRef<View | null>(null);
  const isSpinner = state.ring?.kind === "spinner";
  useEffect(() => {
    const node: unknown = spinnerRef.current;
    if (!isSpinner || !(node instanceof HTMLElement)) {
      return;
    }
    const animation = node.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      {
        duration: SPINNER_TURN_MS,
        iterations: Infinity,
      },
    );
    return () => animation.cancel();
  }, [isSpinner]);
  const percent = state.ring?.kind === "progress" ? state.ring.percent : 0;
  const arcLength = (RING_CIRCUMFERENCE * Math.min(percent, FULL_PERCENT)) / FULL_PERCENT;
  return (
    <View ref={spinnerRef} style={styles.ring} pointerEvents="none">
      <ThemedRing
        isSpinner={isSpinner}
        arcLength={arcLength}
        uniProps={state.isActive ? activeRingMapping : idleRingMapping}
      />
    </View>
  );
}

function Ring({
  isSpinner,
  arcLength,
  color,
  trackColor,
}: {
  isSpinner: boolean;
  arcLength: number;
  color: string;
  trackColor: string;
}) {
  // The arc starts at 12 o'clock and runs clockwise; the spinner starts at 3 o'clock.
  const dashArray = isSpinner
    ? `${SPINNER_ARC} ${SPINNER_ARC}`
    : `${arcLength} ${RING_CIRCUMFERENCE}`;
  return (
    <svg width={BUTTON_SIZE} height={BUTTON_SIZE} viewBox={`0 0 ${BUTTON_SIZE} ${BUTTON_SIZE}`}>
      <circle
        cx={BUTTON_CENTER}
        cy={BUTTON_CENTER}
        r={RING_RADIUS}
        fill="none"
        stroke={trackColor}
        strokeWidth={RING_STROKE}
      />
      <circle
        cx={BUTTON_CENTER}
        cy={BUTTON_CENTER}
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={RING_STROKE}
        strokeDasharray={dashArray}
        transform={isSpinner ? undefined : `rotate(-90 ${BUTTON_CENTER} ${BUTTON_CENTER})`}
      />
    </svg>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.badgeText}>
        {count > BADGE_MAX_COUNT ? `${BADGE_MAX_COUNT}+` : count}
      </Text>
    </View>
  );
}

/**
 * Chrome's "download started" animation: a circle with the arrow rises from the middle of the
 * page to just under the button, then shrinks into it, in the page the download came from.
 */
interface StartedFlight {
  left: number;
  startTop: number;
  stopTop: number;
  endTop: number;
}

/**
 * Chrome's "download started" animation: a circle with the arrow rises from the middle of the
 * page to just under the button, then shrinks into it, in the page the download came from.
 */
function StartedAnimation({
  browserId,
  isPresented,
  page,
  button,
}: {
  browserId: string;
  isPresented: boolean;
  page: HTMLElement | null;
  button: React.RefObject<View | null>;
}) {
  const lastStarted = useDownloadsUiStore((ui) => ui.lastStarted);
  const handledRef = useRef(lastStarted?.sequence ?? 0);
  const [flight, setFlight] = useState<StartedFlight | null>(null);
  const layer = useOverlayLayer("floating");
  const circleRef = useRef<View | null>(null);

  useEffect(() => {
    if (!lastStarted || lastStarted.sequence === handledRef.current) {
      return;
    }
    handledRef.current = lastStarted.sequence;
    const isFromThisPage = lastStarted.browserId === null || lastStarted.browserId === browserId;
    if (!isPresented || !isFromThisPage || !page || prefersReducedMotion()) {
      return;
    }
    const pageElement = page;
    // It plays once the popped-out button has slid in.
    const timer = setTimeout(() => {
      const buttonNode: unknown = button.current;
      const pageBounds = pageElement.getBoundingClientRect();
      if (!(buttonNode instanceof HTMLElement) || pageBounds.height < STARTED_MIN_PAGE_HEIGHT) {
        return;
      }
      const buttonBounds = buttonNode.getBoundingClientRect();
      const half = STARTED_CIRCLE_SIZE / 2;
      setFlight({
        left: buttonBounds.left + buttonBounds.width / 2 - half,
        startTop: pageBounds.top + pageBounds.height / 2 - half,
        stopTop: buttonBounds.bottom + STARTED_STOP_BELOW_BUTTON,
        endTop: buttonBounds.top + buttonBounds.height / 2 - half,
      });
    }, SLIDE_IN_MS);
    return () => clearTimeout(timer);
  }, [browserId, button, isPresented, lastStarted, page]);

  useLayoutEffect(() => {
    const node: unknown = circleRef.current;
    if (!flight || !(node instanceof HTMLElement)) {
      return;
    }
    const animation = node.animate(
      [
        { top: `${flight.startTop}px`, opacity: 0, offset: 0 },
        { top: `${flight.stopTop}px`, opacity: 1, offset: STARTED_SPLIT },
        { top: `${flight.endTop}px`, opacity: 0, offset: 1 },
      ],
      { duration: STARTED_MS, easing: "linear", fill: "forwards" },
    );
    let isCurrent = true;
    void animation.finished
      .then(() => {
        if (isCurrent) setFlight(null);
        return undefined;
      })
      .catch(() => {
        // Cancelled by unmounting; nothing is left to clean up.
      });
    return () => {
      isCurrent = false;
      animation.cancel();
    };
  }, [flight]);

  if (!flight) {
    return null;
  }
  return createPortal(
    <View
      ref={circleRef}
      pointerEvents="none"
      style={[styles.startedCircle, { left: flight.left, top: flight.startTop, zIndex: layer }]}
    >
      <ThemedChromeIcon
        name="downloadStarted"
        size={STARTED_ICON_SIZE}
        uniProps={startedIconMapping}
      />
    </View>,
    getOverlayRoot(),
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const ThemedRing = withUnistyles(Ring);
const activeIconMapping = chromeColorProps("downloadActive");
const idleIconMapping = chromeColorProps("toolbarIcon");
const startedIconMapping = chromeColorProps("downloadActive");
const activeRingMapping = (theme: {
  chrome: { downloadRingActive: string; downloadRingTrack: string };
}) => ({
  color: theme.chrome.downloadRingActive,
  trackColor: theme.chrome.downloadRingTrack,
});
const idleRingMapping = (theme: {
  chrome: { toolbarIcon: string; downloadRingTrack: string };
}) => ({
  color: theme.chrome.toolbarIcon,
  trackColor: theme.chrome.downloadRingTrack,
});

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    slideIn: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      overflow: "hidden",
      flexShrink: 0,
    },
    face: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    dragged: {
      opacity: 0,
    },
    ring: {
      position: "absolute",
      top: 0,
      left: 0,
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
    },
    // pinned_toolbar_button_status_indicator.cc: 14 × 2, 1 dip under the 20-dip icon.
    underline: {
      position: "absolute",
      left: 10,
      top: 28,
      width: 14,
      height: 2,
      borderRadius: 1,
      backgroundColor: chrome.downloadActive,
    },
    // download_button_views.cc: a 17-dip disc in the button's bottom-right quarter.
    badge: {
      position: "absolute",
      left: BUTTON_CENTER,
      top: BUTTON_CENTER,
      width: BUTTON_CENTER,
      height: BUTTON_CENTER,
      borderRadius: 8,
      backgroundColor: chrome.toolbar,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 13,
      lineHeight: 17,
      color: chrome.downloadRingActive,
    },
    startedCircle: {
      position: "absolute",
      width: STARTED_CIRCLE_SIZE,
      height: STARTED_CIRCLE_SIZE,
      borderRadius: STARTED_CIRCLE_SIZE / 2,
      backgroundColor: chrome.downloadStartedCircle,
      alignItems: "center",
      justifyContent: "center",
    },
  };
});
