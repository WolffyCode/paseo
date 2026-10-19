import { useCallback, useMemo, useRef } from "react";
import { Image, Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DesktopBrowserDownload } from "@/desktop/host";
import { CHROME_FONT_FAMILY } from "../chrome-theme";
import { WebUiIcon, type WebUiIconName } from "../webui/icons";
import { WEBUI_LAYOUT, webUiColorProps } from "../webui/theme";
import { useFileIcon } from "./file-icon";
import { pageProgressText, pageTag } from "./format";
import { cardButtons, initiatorHost, isActiveCard, type DownloadCardButton } from "./page-model";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

// item.css: a 32 dip file icon at 24/18, the text column from 104, 32 dip icon buttons 12 apart.
const FILE_ICON_SIZE = 32;
const ICON_BUTTON_SIZE = 32;
const PROGRESS_HEIGHT = 4;
const PERCENT = 100;

const BUTTON_ICONS: Record<DownloadCardButton, WebUiIconName> = {
  copyLink: "link",
  moreActions: "moreVert",
  showInFolder: "folderOpen",
  remove: "clear",
};

const BUTTON_LABEL_KEYS = {
  copyLink: "workspace.browser.downloads.page.copyLink",
  moreActions: "workspace.browser.downloads.page.moreActions",
  showInFolder: "workspace.browser.downloads.page.showInFolder",
  remove: "workspace.browser.downloads.page.deleteFromHistory",
} as const satisfies Record<DownloadCardButton, string>;

/** One download on chrome://downloads (downloads-item). */
export function DownloadCard({
  download,
  onOpen,
  onButton,
}: {
  download: DesktopBrowserDownload;
  onOpen: (download: DesktopBrowserDownload) => void;
  /** A button was pressed; ⋮ passes its own element so the menu can hang from it. */
  onButton: (
    download: DesktopBrowserDownload,
    button: DownloadCardButton,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const { t, i18n } = useTranslation();
  const isActive = isActiveCard(download);
  const isOpenable = download.state === "complete" && !download.isFileMissing;
  const tag = pageTag(download, t);
  const host = initiatorHost(download);
  const hasProgress = download.state === "in_progress";
  const fraction =
    download.totalBytes > 0 ? Math.min(1, download.receivedBytes / download.totalBytes) : 0;
  const progressWidth = useMemo(() => ({ width: `${fraction * PERCENT}%` as const }), [fraction]);
  const handleOpen = useCallback(() => onOpen(download), [download, onOpen]);

  return (
    <View
      style={[styles.card, isActive ? styles.cardActive : styles.cardInactive]}
      testID={`downloads-card-${download.id}`}
    >
      <View style={[styles.iconCell, !isActive && styles.iconInactive]}>
        <CardFileIcon download={download} />
      </View>
      <View style={styles.details}>
        <View style={styles.nameRow}>
          {isOpenable ? (
            <Pressable accessibilityRole="link" onPress={handleOpen} style={styles.nameLink}>
              <Text numberOfLines={1} style={[styles.name, styles.nameAsLink]}>
                {download.fileName}
              </Text>
            </Pressable>
          ) : (
            <Text numberOfLines={1} style={[styles.name, !isActive && styles.nameInactive]}>
              {download.fileName}
            </Text>
          )}
          {tag ? <Text style={[styles.tag, !isActive && styles.tagInactive]}>{tag}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.origin}>
          {host ? t("workspace.browser.downloads.page.from", { origin: host }) : ""}
        </Text>
        {hasProgress ? (
          <>
            <Text style={[styles.description, !isActive && styles.descriptionInactive]}>
              {pageProgressText(download, t, i18n.language)}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, progressWidth]} />
            </View>
          </>
        ) : null}
      </View>
      <View style={styles.buttons}>
        {cardButtons(download).map((button) => (
          <CardIconButton
            key={button}
            download={download}
            button={button}
            label={t(BUTTON_LABEL_KEYS[button])}
            onPress={onButton}
          />
        ))}
      </View>
    </View>
  );
}

function CardFileIcon({ download }: { download: DesktopBrowserDownload }) {
  const iconUrl = useFileIcon(download);
  const source = useMemo(() => (iconUrl ? { uri: iconUrl } : null), [iconUrl]);
  if (source) {
    return <Image source={source} style={styles.fileIcon} />;
  }
  return <ThemedWebUiIcon name="draftFilled" size={FILE_ICON_SIZE} uniProps={iconButtonMapping} />;
}

function CardIconButton({
  download,
  button,
  label,
  onPress,
}: {
  download: DesktopBrowserDownload;
  button: DownloadCardButton;
  label: string;
  onPress: (
    download: DesktopBrowserDownload,
    button: DownloadCardButton,
    anchor: HTMLElement | null,
  ) => void;
}) {
  const buttonRef = useRef<View | null>(null);
  const handlePress = useCallback(() => {
    const node: unknown = buttonRef.current;
    onPress(download, button, node instanceof HTMLElement ? node : null);
  }, [button, download, onPress]);
  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          ref={buttonRef}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={handlePress}
          style={iconButtonStyle}
          testID={`downloads-card-${button}`}
        >
          <ThemedWebUiIcon
            name={BUTTON_ICONS[button]}
            size={WEBUI_LAYOUT.iconSize}
            uniProps={iconButtonMapping}
          />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={4}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function iconButtonStyle({ hovered, pressed }: HoverState) {
  return [
    styles.iconButton,
    hovered && styles.iconButtonHovered,
    pressed && styles.iconButtonPressed,
  ];
}

const ThemedWebUiIcon = withUnistyles(WebUiIcon);
const iconButtonMapping = webUiColorProps("downloadIconButton");

const styles = StyleSheet.create((theme) => {
  const colors = theme.webui;
  return {
    card: {
      minHeight: 75,
      borderRadius: WEBUI_LAYOUT.cardRadius,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    cardActive: {
      backgroundColor: colors.card,
      boxShadow: WEBUI_LAYOUT.cardShadow,
    },
    cardInactive: {
      backgroundColor: colors.downloadCardInactive,
    },
    iconCell: {
      width: FILE_ICON_SIZE,
      height: FILE_ICON_SIZE,
      marginTop: 18,
      marginLeft: 24,
      marginRight: 48,
    },
    // A stopped download's icon goes gray at half strength (item.css).
    iconInactive: {
      opacity: 0.5,
      filter: "grayscale(100%)",
    },
    fileIcon: {
      width: FILE_ICON_SIZE,
      height: FILE_ICON_SIZE,
    },
    details: {
      flex: 1,
      minWidth: 0,
      paddingTop: 18,
      paddingBottom: 16,
      paddingRight: 16,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "baseline",
      minWidth: 0,
    },
    nameLink: {
      flexShrink: 1,
      minWidth: 0,
    },
    name: {
      flexShrink: 1,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      fontWeight: "500",
      color: colors.downloadName,
    },
    nameAsLink: {
      color: colors.downloadLink,
      textDecorationLine: "underline",
    },
    nameInactive: {
      color: colors.downloadNameInactive,
      textDecorationLine: "line-through",
    },
    tag: {
      marginLeft: 12,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      fontWeight: "500",
      color: colors.downloadTag,
    },
    tagInactive: {
      color: colors.downloadTag,
    },
    origin: {
      marginTop: 6,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.downloadDescription,
    },
    description: {
      marginTop: 16,
      fontFamily: CHROME_FONT_FAMILY,
      fontSize: WEBUI_LAYOUT.fontSize,
      lineHeight: WEBUI_LAYOUT.lineHeight,
      color: colors.downloadDescription,
    },
    descriptionInactive: {
      color: colors.downloadDescriptionInactive,
    },
    progressTrack: {
      height: PROGRESS_HEIGHT,
      marginTop: 16,
      backgroundColor: colors.downloadProgressTrack,
      overflow: "hidden",
    },
    progressFill: {
      height: PROGRESS_HEIGHT,
      backgroundColor: colors.downloadProgress,
    },
    buttons: {
      flexDirection: "row",
      gap: 12,
      marginTop: 12,
      marginRight: 12,
    },
    iconButton: {
      width: ICON_BUTTON_SIZE,
      height: ICON_BUTTON_SIZE,
      borderRadius: ICON_BUTTON_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    iconButtonHovered: {
      backgroundColor: colors.hover,
    },
    iconButtonPressed: {
      backgroundColor: colors.pressed,
    },
    tooltipText: {
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
  };
});
