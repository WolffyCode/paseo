import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { EditingTextInput } from "@/components/ui/text-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDesktopHost } from "@/desktop/host";
import { ChromeBubble, ChromeBubbleCloseButton } from "../chrome-bubble";
import { ChromeDialogButton } from "../chrome-controls";
import { ChromeIcon } from "../chrome-icons";
import { CHROME_FONT_FAMILY, chromeColorProps } from "../chrome-theme";
import {
  QR_CODE_MAX_INPUT_LENGTH,
  QR_CODE_MODULE_PIXELS,
  qrCodeDrawing,
  qrCodeFileName,
  type QrCodeDrawing,
} from "./model";

// DISTANCE_BUBBLE_PREFERRED_WIDTH, and the image's 240 dip square inside a 2 dip rounded border.
const BUBBLE_WIDTH = 320;
const IMAGE_SIZE = 240;
const IMAGE_BORDER_WIDTH = 2;
const IMAGE_CORNER_RADIUS = 12;
const INFO_ICON_SIZE = 20;
const QR_CODE_COLOR = "#000000";
const QR_CODE_BACKGROUND = "#FFFFFF";
const PNG_TYPE = "image/png";

/** The code as the PNG Chrome copies and downloads: 10 px modules on white. */
function renderQrCodePng(drawing: Extract<QrCodeDrawing, { kind: "code" }>): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = drawing.size * QR_CODE_MODULE_PIXELS;
  canvas.height = drawing.size * QR_CODE_MODULE_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }
  context.fillStyle = QR_CODE_BACKGROUND;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(QR_CODE_MODULE_PIXELS, QR_CODE_MODULE_PIXELS);
  context.fillStyle = QR_CODE_COLOR;
  context.fill(new Path2D(drawing.path), "evenodd");
  return canvas;
}

/**
 * Chrome's 扫描二维码 bubble: the page's address as a QR code, an editable address under it that
 * redraws the code as you type, and 复制 / 下载 for the image.
 */
export function QrCodeBubble({
  anchor,
  browserId,
  url,
  onClose,
}: {
  anchor: HTMLElement | null;
  browserId: string;
  url: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(url);
  const drawing = useMemo(() => qrCodeDrawing(text), [text]);
  const hasCode = drawing.kind === "code";

  const copyImage = useCallback(() => {
    if (drawing.kind !== "code") {
      return;
    }
    renderQrCodePng(drawing).toBlob((blob) => {
      if (!blob) {
        return;
      }
      void navigator.clipboard.write([new ClipboardItem({ [PNG_TYPE]: blob })]);
    }, PNG_TYPE);
  }, [drawing]);

  const downloadImage = useCallback(() => {
    if (drawing.kind !== "code") {
      return;
    }
    const dataUrl = renderQrCodePng(drawing).toDataURL(PNG_TYPE);
    void getDesktopHost()?.browser?.downloads?.downloadNamed(
      browserId,
      dataUrl,
      qrCodeFileName(text),
    );
  }, [browserId, drawing, text]);

  return (
    <ChromeBubble
      anchor={anchor}
      width={BUBBLE_WIDTH}
      onClose={onClose}
      testID="browser-qr-code-bubble"
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("workspace.browser.qrCode.title")}</Text>
          <ChromeBubbleCloseButton
            label={t("common.actions.close")}
            onPress={onClose}
            testID="browser-qr-code-close"
          />
        </View>
        <View style={styles.imageFrame}>
          {drawing.kind === "code" ? (
            <Svg
              width={IMAGE_SIZE}
              height={IMAGE_SIZE}
              viewBox={`0 0 ${drawing.size} ${drawing.size}`}
            >
              <Path d={drawing.path} fill={QR_CODE_COLOR} fillRule="evenodd" />
            </Svg>
          ) : null}
          {drawing.kind === "failed" ? (
            <Text style={styles.centerError}>{t("workspace.browser.qrCode.failed")}</Text>
          ) : null}
        </View>
        <EditingTextInput
          initialValue={url}
          onChangeText={setText}
          accessibilityLabel={t("workspace.browser.qrCode.url")}
          style={styles.urlField}
          testID="browser-qr-code-url"
        />
        <Text style={[styles.bottomError, drawing.kind !== "tooLong" && styles.hidden]}>
          {t("workspace.browser.qrCode.tooLong", { limit: QR_CODE_MAX_INPUT_LENGTH })}
        </Text>
        <View style={styles.buttons}>
          <Tooltip enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild>
              <View accessibilityLabel={t("workspace.browser.qrCode.tooltip")}>
                <ThemedChromeIcon name="info" size={INFO_ICON_SIZE} uniProps={infoIconMapping} />
              </View>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" offset={6}>
              <Text style={styles.tooltipText}>{t("workspace.browser.qrCode.tooltip")}</Text>
            </TooltipContent>
          </Tooltip>
          <View style={styles.buttonsSpacer} />
          <ChromeDialogButton
            label={t("workspace.browser.qrCode.copy")}
            variant="tonal"
            isDisabled={!hasCode}
            onPress={copyImage}
            testID="browser-qr-code-copy"
          />
          <ChromeDialogButton
            label={t("workspace.browser.qrCode.download")}
            variant="tonal"
            isDisabled={!hasCode}
            onPress={downloadImage}
            testID="browser-qr-code-download"
          />
        </View>
      </View>
    </ChromeBubble>
  );
}

const ThemedChromeIcon = withUnistyles(ChromeIcon);
const infoIconMapping = chromeColorProps("bubbleTextSecondary");

const styles = StyleSheet.create((theme) => {
  const { chrome } = theme;
  const bodyText = {
    fontFamily: CHROME_FONT_FAMILY,
    fontSize: 13,
    lineHeight: 20,
  } as const;
  return {
    content: {
      paddingTop: 8,
      paddingBottom: 20,
      paddingHorizontal: 20,
    },
    header: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 8,
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
    imageFrame: {
      alignSelf: "center",
      width: IMAGE_SIZE + IMAGE_CORNER_RADIUS,
      height: IMAGE_SIZE + IMAGE_CORNER_RADIUS,
      marginTop: 8,
      borderWidth: IMAGE_BORDER_WIDTH,
      borderColor: chrome.selectBorder,
      borderRadius: IMAGE_CORNER_RADIUS,
      backgroundColor: QR_CODE_BACKGROUND,
      alignItems: "center",
      justifyContent: "center",
    },
    centerError: {
      ...bodyText,
      color: chrome.bubbleTextSecondary,
      textAlign: "center",
    },
    urlField: {
      ...bodyText,
      height: 32,
      marginTop: 16,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: chrome.selectBorder,
      borderRadius: 8,
      color: chrome.bubbleText,
    },
    bottomError: {
      ...bodyText,
      marginTop: 4,
      color: chrome.bubbleTextSecondary,
    },
    hidden: {
      opacity: 0,
    },
    buttons: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 12,
      gap: 8,
    },
    buttonsSpacer: {
      flex: 1,
    },
    tooltipText: {
      maxWidth: BUBBLE_WIDTH,
      fontSize: theme.fontSize.sm,
      color: theme.colors.popoverForeground,
    },
  };
});
