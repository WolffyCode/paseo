import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getOverlayRoot, useOverlayLayer } from "@/lib/overlay-root";
import { ChromeIcon, type ChromeIconName } from "./chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "./chrome-theme";
import { useElementBounds } from "./use-element-bounds";

// toast_controller.h / toast_view.cc: a toast without a button stays 4 s; it slides 50 dip and
// grows from half its height on the way in and shrinks on the way out.
const TOAST_TIMEOUT_MS = 4000;
const SLIDE_TRANSFORM = "translateY(-50px) scaleY(0.5)";
const ENTER_MS = 300;
const ENTER_EASING = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const ENTER_FRAME_FADE_MS = 50;
const ENTER_CONTENT_DELAY_MS = 50;
const ENTER_CONTENT_FADE_MS = 150;
const EXIT_MS = 150;
const EXIT_EASING = "cubic-bezier(0.3, 0, 0.8, 0.15)";
const EXIT_CONTENT_FADE_MS = 100;
const EXIT_FRAME_DELAY_MS = 100;
const EXIT_FRAME_FADE_MS = 50;
// chrome_layout_provider.cc: 48 tall, 12 before the icon, 16 after the text.
const TOAST_HEIGHT = 48;
const TOAST_ICON_SIZE = 20;
// The pill's middle sits on the page's top edge.
const HALF_TOAST_HEIGHT = TOAST_HEIGHT / 2;

/**
 * How a toast leaves: "close" slides it out (time out, tab switch, navigation); "preempt" only
 * fades it, for a newer toast that waits behind it.
 */
type ToastExit = "close" | "preempt";

interface ShownToast {
  id: number;
  exit: ToastExit | null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface ToastQueue {
  shown: ShownToast | null;
  /** The newest request waiting for the shown toast to fade; Chrome keeps one. */
  queuedId: number | null;
}

type ToastQueueEvent =
  | { kind: "show"; id: number }
  | { kind: "close" }
  | { kind: "exited"; id: number };

function nextToastQueue(queue: ToastQueue, event: ToastQueueEvent): ToastQueue {
  if (event.kind === "show") {
    if (!queue.shown) {
      return { shown: { id: event.id, exit: null }, queuedId: null };
    }
    const shown: ShownToast = queue.shown.exit ? queue.shown : { ...queue.shown, exit: "preempt" };
    return { shown, queuedId: event.id };
  }
  if (event.kind === "close") {
    const shown =
      queue.shown && !queue.shown.exit ? { ...queue.shown, exit: "close" as const } : queue.shown;
    return { shown, queuedId: null };
  }
  if (queue.shown?.id !== event.id) {
    return queue;
  }
  const shown = queue.queuedId === null ? null : { id: queue.queuedId, exit: null };
  return { shown, queuedId: null };
}

/**
 * Chrome's ToastController for one tab: one toast at a time; a new request fades the current one
 * and shows after it.
 */
export function useChromeToasts() {
  const nextIdRef = useRef(1);
  const [queue, dispatch] = useReducer(nextToastQueue, { shown: null, queuedId: null });
  const showToast = useCallback(() => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    dispatch({ kind: "show", id });
  }, []);
  const closeToast = useCallback(() => dispatch({ kind: "close" }), []);
  const handleExited = useCallback((id: number) => dispatch({ kind: "exited", id }), []);
  return { shown: queue.shown, showToast, closeToast, handleExited };
}

/**
 * A Chrome toast: an icon and a line of text in a pill straddling the top edge of the page, above
 * the toolbar and the page alike. It takes clicks without acting on them, as Chrome's does.
 */
export function ChromeToast({
  toast,
  icon,
  text,
  page,
  isHidden,
  onTimeout,
  onExited,
}: {
  toast: ShownToast;
  icon: ChromeIconName;
  text: string;
  /** The page area the toast centers on. */
  page: HTMLElement | null;
  /** Chrome hides a toast without closing it while the address bar has focus. */
  isHidden: boolean;
  onTimeout: () => void;
  onExited: (id: number) => void;
}) {
  const pageBounds = useElementBounds(page);
  const layer = useOverlayLayer("floating");
  const pillRef = useRef<View | null>(null);
  const contentRef = useRef<View | null>(null);

  // The timer starts with the request, before the entry animation, and nothing pauses it.
  useEffect(() => {
    const timer = setTimeout(onTimeout, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onTimeout]);

  useLayoutEffect(() => {
    const pill: unknown = pillRef.current;
    const content: unknown = contentRef.current;
    if (!(pill instanceof HTMLElement) || !(content instanceof HTMLElement)) {
      return;
    }
    if (prefersReducedMotion()) {
      return;
    }
    pill.animate([{ transform: SLIDE_TRANSFORM }, { transform: "none" }], {
      duration: ENTER_MS,
      easing: ENTER_EASING,
    });
    pill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_FRAME_FADE_MS });
    content.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: ENTER_CONTENT_DELAY_MS,
      duration: ENTER_CONTENT_FADE_MS,
      fill: "backwards",
    });
  }, []);

  useEffect(() => {
    const pill: unknown = pillRef.current;
    const content: unknown = contentRef.current;
    if (!toast.exit) {
      return;
    }
    const toastId = toast.id;
    if (!(pill instanceof HTMLElement) || !(content instanceof HTMLElement) || isHidden) {
      onExited(toastId);
      return;
    }
    if (prefersReducedMotion()) {
      onExited(toastId);
      return;
    }
    const animations = [
      content.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_CONTENT_FADE_MS,
        fill: "forwards",
      }),
      pill.animate([{ opacity: 1 }, { opacity: 0 }], {
        delay: EXIT_FRAME_DELAY_MS,
        duration: EXIT_FRAME_FADE_MS,
        fill: "forwards",
      }),
    ];
    if (toast.exit === "close") {
      animations.push(
        pill.animate([{ transform: "none" }, { transform: SLIDE_TRANSFORM }], {
          duration: EXIT_MS,
          easing: EXIT_EASING,
          fill: "forwards",
        }),
      );
    }
    let isCancelled = false;
    void Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        if (!isCancelled) {
          onExited(toastId);
        }
        return undefined;
      })
      .catch(() => {
        // An animation cancelled by unmounting needs no further step.
      });
    return () => {
      isCancelled = true;
    };
  }, [isHidden, onExited, toast.exit, toast.id]);

  if (!pageBounds) {
    return null;
  }
  const anchorStyle = {
    left: pageBounds.left + pageBounds.width / 2,
    top: pageBounds.top - HALF_TOAST_HEIGHT,
    zIndex: layer,
  };
  return createPortal(
    <View style={[styles.anchor, anchorStyle, isHidden && styles.hidden]}>
      <View
        ref={pillRef}
        role="alert"
        accessibilityLiveRegion="polite"
        style={styles.pill}
        testID="browser-toast"
      >
        <View ref={contentRef} style={styles.content}>
          <View style={styles.icon} aria-hidden>
            <ThemedChromeIcon name={icon} size={TOAST_ICON_SIZE} uniProps={toastIconMapping} />
          </View>
          <Text numberOfLines={1} style={styles.label}>
            {text}
          </Text>
        </View>
      </View>
    </View>,
    getOverlayRoot(),
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const toastIconMapping = chromeColorProps("toastForeground");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    // A zero-size point at the page's top middle; the pill centers on it.
    anchor: {
      position: "absolute",
      width: 0,
      height: TOAST_HEIGHT,
      alignItems: "center",
    },
    hidden: {
      display: "none",
    },
    pill: {
      height: TOAST_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 12,
      paddingRight: 16,
      borderRadius: HALF_TOAST_HEIGHT,
      backgroundColor: chrome.toastBackground,
      boxShadow: chrome.toastShadow,
      flexShrink: 0,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
    },
    icon: {
      width: TOAST_ICON_SIZE,
      height: TOAST_ICON_SIZE,
      marginHorizontal: 2,
    },
    label: {
      marginLeft: 4,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 24,
      color: chrome.toastForeground,
    },
  };
});
