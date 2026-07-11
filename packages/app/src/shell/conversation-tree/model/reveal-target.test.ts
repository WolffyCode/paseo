import { describe, expect, test } from "vitest";
import { selectFileManagerTargetId } from "./reveal-target";

describe("selectFileManagerTargetId", () => {
  test("returns the platform-provided file-manager id instead of assuming Finder", () => {
    expect(
      selectFileManagerTargetId([
        { id: "vscode", label: "Visual Studio Code", kind: "editor" },
        { id: "explorer", label: "Explorer", kind: "file-manager" },
      ]),
    ).toBe("explorer");
  });

  test("returns null when the desktop bridge exposes no file-manager target", () => {
    expect(
      selectFileManagerTargetId([{ id: "vscode", label: "Visual Studio Code", kind: "editor" }]),
    ).toBeNull();
  });
});
