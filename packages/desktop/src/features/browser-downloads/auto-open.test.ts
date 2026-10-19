import { describe, expect, it } from "vitest";
import { canOpenTypeAutomatically, downloadExtension } from "./auto-open";

describe("downloadExtension", () => {
  it("reads the last extension in lower case", () => {
    expect(downloadExtension("Report.PDF")).toBe("pdf");
    expect(downloadExtension("archive.tar.gz")).toBe("gz");
    expect(downloadExtension("README")).toBe("");
  });
});

describe("canOpenTypeAutomatically", () => {
  it("offers ordinary documents and refuses names without an extension", () => {
    expect(canOpenTypeAutomatically("notes.txt")).toBe(true);
    expect(canOpenTypeAutomatically("photo.jpeg")).toBe(true);
    expect(canOpenTypeAutomatically("Makefile")).toBe(false);
  });

  it("never opens disk images, installers or scripts by themselves", () => {
    expect(canOpenTypeAutomatically("Helm.dmg")).toBe(false);
    expect(canOpenTypeAutomatically("setup.pkg")).toBe(false);
    expect(canOpenTypeAutomatically("install.sh")).toBe(false);
  });
});
