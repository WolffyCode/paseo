import path from "node:path";
import { describe, expect, it } from "vitest";
import { insertBeforeExtension, uniqueDownloadPath } from "./unique-path";

const DOWNLOADS = "/Users/someone/Downloads";

describe("insertBeforeExtension", () => {
  it.each([
    ["report.pdf", "report (1).pdf"],
    ["archive.tar.gz", "archive (1).tar.gz"],
    ["script.user.js", "script (1).user.js"],
    ["photo.backup.gz", "photo.backup (1).gz"],
    ["README", "README (1)"],
    [".bashrc", " (1).bashrc"],
  ])("puts the number in %s the way Chrome does", (fileName, expected) => {
    expect(insertBeforeExtension(fileName, " (1)")).toBe(expected);
  });
});

describe("uniqueDownloadPath", () => {
  it("keeps the suggested name when nothing has it", () => {
    expect(
      uniqueDownloadPath({
        directory: DOWNLOADS,
        fileName: "report.pdf",
        startTime: new Date(2026, 9, 17, 20, 15, 30, 5),
        isInUse: () => false,
      }),
    ).toBe(path.join(DOWNLOADS, "report.pdf"));
  });

  it("numbers the name past files and downloads that already use it", () => {
    const taken = new Set([
      path.join(DOWNLOADS, "report.pdf"),
      path.join(DOWNLOADS, "report (1).pdf"),
    ]);
    expect(
      uniqueDownloadPath({
        directory: DOWNLOADS,
        fileName: "report.pdf",
        startTime: new Date(2026, 9, 17, 20, 15, 30, 5),
        isInUse: (candidate) => taken.has(candidate),
      }),
    ).toBe(path.join(DOWNLOADS, "report (2).pdf"));
  });

  it("falls back to the start time after a hundred numbered names", () => {
    const timestamped = path.join(DOWNLOADS, "report - 2026-10-17T201530.005.pdf");
    expect(
      uniqueDownloadPath({
        directory: DOWNLOADS,
        fileName: "report.pdf",
        startTime: new Date(2026, 9, 17, 20, 15, 30, 5),
        isInUse: (candidate) => candidate !== timestamped,
      }),
    ).toBe(timestamped);
  });

  it("gives up when every name Chrome tries is taken", () => {
    expect(
      uniqueDownloadPath({
        directory: DOWNLOADS,
        fileName: "report.pdf",
        startTime: new Date(2026, 9, 17, 20, 15, 30, 5),
        isInUse: () => true,
      }),
    ).toBeNull();
  });
});
