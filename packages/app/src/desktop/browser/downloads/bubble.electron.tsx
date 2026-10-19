import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDesktopHost, type DesktopBrowserDownload } from "@/desktop/host";
import { ChromeBubble, ChromeBubbleCloseButton } from "../chrome-bubble";
import { ChromeIcon, type ChromeIconName } from "../chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "../chrome-theme";
import { bubbleStatus } from "./format";
import { bubbleDownloads } from "./display";
import { useFileIcon } from "./file-icon";
import { showDownloadMenu } from "./row-menu";
import { useBrowserDownloadsStore } from "./store";
import { useDownloadsUiStore, useNow } from "./ui-state";

// download_bubble_primary_view.cc and download_toolbar_ui_controller.cc.
const BUBBLE_WIDTH = 320;
const MINUTE_MS = 60_000;
const LIST_MAX_HEIGHT = 450;
// A partial bubble closes itself after 5 s unless the pointer comes in.
const PARTIAL_VIEW_TIMEOUT_MS = 5000;
const ROW_ICON_SIZE = 20;
const QUICK_ACTION_SIZE = 28;
const PROGRESS_BAR_HEIGHT = 3;
// views::ProgressBar's indeterminate loop.
const INDETERMINATE_LOOP_MS = 2000;

type HoverState = PressableStateCallbackType & { hovered?: boolean };

/** Which view the bubble shows: Chrome's full bubble, or the rows it opens by itself. */
export type DownloadBubbleView = "main" | "partial";

/**
 * Chrome's download bubble hanging from the downloads button: the full view has a title and a
 * footer that opens the downloads page; the partial view lists new rows and closes by itself.
 */
export function DownloadBubble({
  anchor,
  view,
  onClose,
  onShowFullHistory,
}: {
  anchor: HTMLElement | null;
  view: DownloadBubbleView;
  onClose: () => void;
  onShowFullHistory: () => void;
}) {
  const { t } = useTranslation();
  // Rows say "3 分钟前", so the bubble re-renders every minute (download_bubble_row_view.cc).
  const now = useNow(MINUTE_MS);
  const downloads = useBrowserDownloadsStore((state) => state.downloads);
  const actionedIds = useDownloadsUiStore((state) => state.actionedIds);
  // The partial view lists only what nobody has seen in the full bubble.
  const rows = useMemo(() => {
    const listed = bubbleDownloads(downloads, now);
    return view === "partial" ? listed.filter((row) => !actionedIds.has(row.id)) : listed;
  }, [actionedIds, downloads, now, view]);
  const contentRef = useRef<View | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);

  useEffect(() => {
    const node: unknown = contentRef.current;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const element = node;
    const handleEnter = () => setIsPointerInside(true);
    element.addEventListener("pointerenter", handleEnter);
    return () => element.removeEventListener("pointerenter", handleEnter);
  }, []);

  // Hovering cancels the partial bubble's timeout for good, as Chrome's does.
  useEffect(() => {
    if (view !== "partial" || isPointerInside) {
      return;
    }
    const timer = setTimeout(onClose, PARTIAL_VIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPointerInside, onClose, view]);

  return (
    <ChromeBubble
      anchor={anchor}
      width={BUBBLE_WIDTH}
      isModal={view === "main"}
      onClose={onClose}
      testID={`browser-download-bubble-${view}`}
    >
      <View ref={contentRef} style={styles.content}>
        {view === "main" ? (
          <View style={styles.header}>
            <Text style={styles.title}>{t("workspace.browser.downloads.bubbleTitle")}</Text>
            <ChromeBubbleCloseButton
              label={t("workspace.browser.downloads.close")}
              onPress={onClose}
              testID="browser-download-bubble-close"
            />
          </View>
        ) : null}
        <ScrollView style={styles.list}>
          {rows.map((download) => (
            <DownloadRow key={download.id} download={download} now={now} />
          ))}
        </ScrollView>
        {view === "main" ? <FullHistoryRow onPress={onShowFullHistory} /> : null}
      </View>
    </ChromeBubble>
  );
}

function FullHistoryRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const tooltip = t("workspace.browser.downloads.fullHistoryTooltip");
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tooltip}
          onPress={onPress}
          style={footerStyle}
          testID="browser-download-bubble-full-history"
        >
          <Text style={styles.footerLabel}>{t("workspace.browser.downloads.fullHistory")}</Text>
          <ThemedChromeIcon name="launch" size={ROW_ICON_SIZE} uniProps={footerIconMapping} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.tooltipText}>{tooltip}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function footerStyle({ hovered }: HoverState) {
  return [styles.footer, hovered && styles.rowHovered];
}

function RowIcon({ download }: { download: DesktopBrowserDownload }) {
  const fileIconUrl = useFileIcon(download);
  const fileIconSource = useMemo(() => (fileIconUrl ? { uri: fileIconUrl } : null), [fileIconUrl]);
  if (fileIconSource) {
    return <Image source={fileIconSource} style={styles.fileIcon} />;
  }
  const isStopped = download.state === "cancelled" || download.state === "interrupted";
  return (
    <ThemedChromeIcon
      name={isStopped ? "downloadOff" : "fileGeneric"}
      size={ROW_ICON_SIZE}
      uniProps={download.state === "interrupted" ? errorIconMapping : secondaryIconMapping}
    />
  );
}

interface QuickAction {
  key: string;
  icon: ChromeIconName;
  label: string;
  run: () => Promise<void>;
}

function quickActions(download: DesktopBrowserDownload, t: (key: string) => string): QuickAction[] {
  const downloadsBridge = getDesktopHost()?.browser?.downloads;
  if (!downloadsBridge) {
    return [];
  }
  if (download.state === "in_progress") {
    const toggle: QuickAction = download.isPaused
      ? {
          key: "resume",
          icon: "play",
          label: t("workspace.browser.downloads.resume"),
          run: () => downloadsBridge.resume(download.id),
        }
      : {
          key: "pause",
          icon: "pause",
          label: t("workspace.browser.downloads.pause"),
          run: () => downloadsBridge.pause(download.id),
        };
    return [
      toggle,
      {
        key: "cancel",
        icon: "cancelCircle",
        label: t("workspace.browser.downloads.cancel"),
        run: () => downloadsBridge.cancel(download.id),
      },
    ];
  }
  if (download.state === "complete" && !download.isFileMissing) {
    return [
      {
        key: "show",
        icon: "folder",
        label: t("workspace.browser.downloads.showInFolder"),
        run: () => downloadsBridge.showInFolder(download.id),
      },
      {
        key: "open",
        icon: "launch",
        label: t("workspace.browser.downloads.open"),
        run: () => downloadsBridge.open(download.id),
      },
    ];
  }
  return [];
}

/** One download in the bubble (download_bubble_row_view.cc). */
function DownloadRow({ download, now }: { download: DesktopBrowserDownload; now: number }) {
  const { t, i18n } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const status = bubbleStatus(download, now, t, i18n.language);
  const downloadsBridge = getDesktopHost()?.browser?.downloads;
  const actions = quickActions(download, t);

  // A finished file opens; an unfinished one toggles 完成后打开.
  const handlePress = useCallback(() => {
    if (!downloadsBridge) {
      return;
    }
    if (download.state === "complete" && !download.isFileMissing) {
      void downloadsBridge.open(download.id);
    }
    if (download.state === "in_progress") {
      void downloadsBridge.setOpenWhenDone(download.id, !download.openWhenDone);
    }
  }, [download, downloadsBridge]);
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      void showDownloadMenu({ download, t });
    },
    [download, t],
  );
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  // react-native-web forwards this DOM handler; RN's types don't list it.
  const domHandlers = { onContextMenu: handleContextMenu };

  let mainButton: { label: string; run: () => void } | null = null;
  if (download.state === "interrupted" && downloadsBridge) {
    mainButton = download.canResume
      ? {
          label: t("workspace.browser.downloads.resumeButton"),
          run: () => void downloadsBridge.resume(download.id),
        }
      : {
          label: t("workspace.browser.downloads.retry"),
          run: () => void downloadsBridge.retry(download.id),
        };
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${download.fileName} ${status.text}`}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      {...domHandlers}
      style={[styles.row, isHovered && styles.rowHovered]}
      testID={`browser-download-row-${download.id}`}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowIconCell}>
          <RowIcon download={download} />
        </View>
        <View style={styles.rowLabels}>
          <Text style={styles.rowName}>{download.fileName}</Text>
          <Text style={[styles.rowStatus, status.isError && styles.rowStatusError]}>
            {status.text}
          </Text>
        </View>
        {mainButton ? <RowTextButton label={mainButton.label} onPress={mainButton.run} /> : null}
      </View>
      {download.state === "in_progress" ? <RowProgressBar download={download} /> : null}
      {isHovered && actions.length > 0 ? (
        <View style={styles.quickActions}>
          {actions.map((action) => (
            <QuickActionButton key={action.key} action={action} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function RowTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={textButtonStyle}>
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function textButtonStyle({ hovered }: HoverState) {
  return [styles.textButton, hovered && styles.rowHovered];
}

function QuickActionButton({ action }: { action: QuickAction }) {
  const handlePress = useCallback(() => {
    void action.run();
  }, [action]);
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={handlePress}
          style={quickActionStyle}
          testID={`browser-download-quick-${action.key}`}
        >
          <ThemedChromeIcon
            name={action.icon}
            size={ROW_ICON_SIZE}
            uniProps={secondaryIconMapping}
          />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={6}>
        <Text style={styles.tooltipText}>{action.label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function quickActionStyle({ hovered }: HoverState) {
  return [styles.quickAction, hovered && styles.quickActionHovered];
}

/** The row's 3-dip bar; a download of unknown size gets views::ProgressBar's indeterminate loop. */
function RowProgressBar({ download }: { download: DesktopBrowserDownload }) {
  const isIndeterminate = download.totalBytes <= 0 && !download.isPaused;
  const fillRef = useRef<View | null>(null);
  useEffect(() => {
    const node: unknown = fillRef.current;
    if (!isIndeterminate || !(node instanceof HTMLElement)) {
      return;
    }
    const animation = node.animate(
      [{ transform: "translateX(-100%)" }, { transform: "translateX(300%)" }],
      { duration: INDETERMINATE_LOOP_MS, iterations: Infinity },
    );
    return () => animation.cancel();
  }, [isIndeterminate]);
  let fillWidth: `${number}%` = "25%";
  if (!isIndeterminate) {
    const fraction = download.totalBytes > 0 ? download.receivedBytes / download.totalBytes : 0;
    fillWidth = `${Math.min(1, fraction) * 100}%`;
  }
  return (
    <View style={styles.progressTrack}>
      <View
        ref={fillRef}
        style={[
          styles.progressFill,
          download.isPaused && styles.progressFillPaused,
          { width: fillWidth },
        ]}
      />
    </View>
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const secondaryIconMapping = chromeColorProps("bubbleTextSecondary");
const errorIconMapping = chromeColorProps("downloadError");
const footerIconMapping = chromeColorProps("downloadFooterIcon");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  return {
    content: {
      paddingVertical: 8,
    },
    header: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 8,
      paddingHorizontal: 20,
      gap: 12,
    },
    title: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: "500",
      color: chrome.bubbleText,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
    list: {
      maxHeight: LIST_MAX_HEIGHT,
    },
    row: {
      paddingVertical: 8,
      paddingHorizontal: 20,
    },
    rowHovered: {
      backgroundColor: chrome.toolbarHover,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    // The 20 dip icon sits in a 28 dip cell (4 all round), 12 before the labels.
    rowIconCell: {
      width: ROW_ICON_SIZE + 8,
      height: ROW_ICON_SIZE + 8,
      marginLeft: -4,
      marginRight: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    fileIcon: {
      width: ROW_ICON_SIZE,
      height: ROW_ICON_SIZE,
    },
    rowLabels: {
      flex: 1,
      minWidth: 0,
    },
    rowName: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "500",
      color: chrome.bubbleText,
      wordBreak: "break-word",
    },
    rowStatus: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 11,
      lineHeight: 16,
      color: chrome.bubbleTextSecondary,
    },
    rowStatusError: {
      color: chrome.downloadError,
    },
    textButton: {
      maxHeight: 24,
      height: 24,
      marginLeft: 8,
      paddingHorizontal: 16,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    textButtonLabel: {
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      fontWeight: "500",
      color: chrome.buttonText,
    },
    // The quick actions sit on a strip in the bubble's color that hides the text under them.
    quickActions: {
      position: "absolute",
      top: 8,
      right: 20,
      flexDirection: "row",
      gap: 8,
      backgroundColor: chrome.bubble,
    },
    quickAction: {
      width: QUICK_ACTION_SIZE,
      height: QUICK_ACTION_SIZE,
      borderRadius: QUICK_ACTION_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    quickActionHovered: {
      backgroundColor: chrome.downloadQuickActionHover,
    },
    progressTrack: {
      height: PROGRESS_BAR_HEIGHT,
      marginTop: 8,
      borderRadius: PROGRESS_BAR_HEIGHT,
      overflow: "hidden",
      backgroundColor: chrome.downloadRingTrack,
    },
    progressFill: {
      height: PROGRESS_BAR_HEIGHT,
      borderRadius: PROGRESS_BAR_HEIGHT,
      backgroundColor: chrome.buttonProminent,
    },
    progressFillPaused: {
      backgroundColor: chrome.buttonDisabledText,
    },
    footer: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      paddingHorizontal: 20,
    },
    footerLabel: {
      flex: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "500",
      color: chrome.bubbleText,
    },
  };
});
