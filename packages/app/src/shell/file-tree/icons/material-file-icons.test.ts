import { describe, expect, it } from "vitest";
import { getFileIconSvg } from "./material-file-icons";

// The icon table is a verbatim copy of machine-generated data; these tests lock the lookup contract
// (known extension → its icon, unknown / extensionless → the default) so a broken copy is caught.

describe("getFileIconSvg", () => {
  it("returns a distinct icon for a known code extension", () => {
    const tsx = getFileIconSvg("Button.tsx");
    const json = getFileIconSvg("package.json");
    expect(tsx.startsWith("<svg")).toBe(true);
    expect(json.startsWith("<svg")).toBe(true);
    expect(tsx).not.toBe(json);
  });

  it("maps several common types to non-default, type-specific icons", () => {
    const fallback = getFileIconSvg("file.unknownext");
    for (const name of ["main.py", "image.png", "config.yaml", "yarn.lock", "notes.md"]) {
      expect(getFileIconSvg(name)).not.toBe(fallback);
    }
  });

  it("matches the extension case-insensitively", () => {
    expect(getFileIconSvg("README.MD")).toBe(getFileIconSvg("readme.md"));
  });

  it("falls back to the default icon for an unknown extension", () => {
    expect(getFileIconSvg("data.bespoke")).toBe(getFileIconSvg("another.unknown"));
  });

  it("falls back to the default icon for a name with no extension", () => {
    expect(getFileIconSvg("Makefile")).toBe(getFileIconSvg("data.bespoke"));
  });
});
