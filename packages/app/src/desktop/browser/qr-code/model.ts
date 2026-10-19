import * as QRCode from "qrcode";
import { PRODUCT_NAME } from "@/constants/product";

/**
 * Chrome's 扫描二维码 bubble (chrome/browser/ui/views/qrcode_generator) and the image it draws
 * (components/qr_code_generator/bitmap_generator.cc), in units of one QR module.
 */

// Chrome's own limit, rounded down from what a version 40 code at level M holds.
export const QR_CODE_MAX_INPUT_LENGTH = 2000;
// Chrome never draws a code smaller than version 5, so short addresses get the same density.
const MINIMUM_VERSION = 5;
const LOCATOR_SIZE = 7;
const QUIET_ZONE_MODULES = 4;
// bitmap_generator.cc: 10 px modules, dots of radius 10 / 2 - 1, locator corners of radius 10.
export const QR_CODE_MODULE_PIXELS = 10;
const DOT_RADIUS = 0.4;
const LOCATOR_CORNER_RADIUS = 1;

export type QrCodeDrawing =
  | { kind: "empty" }
  | { kind: "tooLong" }
  | { kind: "failed" }
  /** `path` is drawn with the even-odd rule on a `size` square, quiet zone included. */
  | { kind: "code"; size: number; path: string };

function encode(text: string): QRCode.QRCode {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  if (code.version >= MINIMUM_VERSION) {
    return code;
  }
  return QRCode.create(text, { errorCorrectionLevel: "M", version: MINIMUM_VERSION });
}

function roundedSquare(left: number, top: number, side: number, radius: number): string {
  const right = left + side;
  const bottom = top + side;
  return [
    `M${left + radius} ${top}`,
    `H${right - radius}`,
    `A${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `V${bottom - radius}`,
    `A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H${left + radius}`,
    `A${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V${top + radius}`,
    `A${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
    "Z",
  ].join("");
}

/** The three corner locators: a dark 7×7, a light 5×5 inside it, a dark 3×3 in the middle. */
function locatorPath(left: number, top: number): string {
  return [0, 1, 2]
    .map((inset) =>
      roundedSquare(left + inset, top + inset, LOCATOR_SIZE - inset * 2, LOCATOR_CORNER_RADIUS),
    )
    .join("");
}

function isInLocator(row: number, column: number, size: number): boolean {
  const nearTop = row <= LOCATOR_SIZE;
  const nearLeft = column <= LOCATOR_SIZE;
  const nearRight = column >= size - LOCATOR_SIZE - 1;
  const nearBottom = row >= size - LOCATOR_SIZE - 1;
  return (nearTop && (nearLeft || nearRight)) || (nearBottom && nearLeft);
}

/** Chrome's QR code for `text`: round dots, rounded locators and a four-module quiet zone. */
export function qrCodeDrawing(text: string): QrCodeDrawing {
  if (!text) {
    return { kind: "empty" };
  }
  if (text.length > QR_CODE_MAX_INPUT_LENGTH) {
    return { kind: "tooLong" };
  }
  let code: QRCode.QRCode;
  try {
    code = encode(text);
  } catch {
    // Text the encoder can't fit in any version is Chrome's 无法生成二维码.
    return { kind: "failed" };
  }
  const { size } = code.modules;
  const offset = QUIET_ZONE_MODULES;
  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!code.modules.get(row, column) || isInLocator(row, column, size)) {
        continue;
      }
      const centerX = offset + column + 0.5;
      const centerY = offset + row + 0.5;
      parts.push(
        `M${centerX - DOT_RADIUS} ${centerY}` +
          `a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${DOT_RADIUS * 2} 0` +
          `a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${-DOT_RADIUS * 2} 0Z`,
      );
    }
  }
  parts.push(locatorPath(offset, offset));
  parts.push(locatorPath(offset + size - LOCATOR_SIZE, offset));
  parts.push(locatorPath(offset, offset + size - LOCATOR_SIZE));
  return { kind: "code", size: size + QUIET_ZONE_MODULES * 2, path: parts.join("") };
}

/** The downloaded image's name: qrcode_ and the site's host, or the product for no host. */
export function qrCodeFileName(url: string): string {
  const fallback = `qrcode_${PRODUCT_NAME.toLowerCase()}.png`;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Text that isn't an address names no site.
    return fallback;
  }
  const isIpAddress = /^[\d.]+$/.test(host) || host.startsWith("[");
  if (!host || isIpAddress) {
    return fallback;
  }
  return `qrcode_${host}.png`;
}
