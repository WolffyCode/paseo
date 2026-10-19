import { describe, expect, it } from "vitest";
import { QR_CODE_MAX_INPUT_LENGTH, qrCodeDrawing, qrCodeFileName } from "./model";

describe("the QR code bubble", () => {
  it("draws a short address at version 5 with its quiet zone", () => {
    const drawing = qrCodeDrawing("https://example.com/");
    // Version 5 is 37 modules, plus four on each side.
    expect(drawing).toMatchObject({ kind: "code", size: 45 });
  });

  it("draws nothing for empty text and refuses text over Chrome's limit", () => {
    expect(qrCodeDrawing("")).toEqual({ kind: "empty" });
    expect(qrCodeDrawing("a".repeat(QR_CODE_MAX_INPUT_LENGTH + 1))).toEqual({ kind: "tooLong" });
  });

  it("names the download after the site, as Chrome does", () => {
    expect(qrCodeFileName("https://www.example.com/a?b")).toBe("qrcode_www.example.com.png");
    expect(qrCodeFileName("http://127.0.0.1:8080/")).toBe("qrcode_helm.png");
    expect(qrCodeFileName("not a url")).toBe("qrcode_helm.png");
  });
});
