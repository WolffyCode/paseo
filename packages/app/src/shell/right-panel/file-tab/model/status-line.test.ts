import { describe, expect, it } from "vitest";
import { languageLabel } from "./status-line";

// languageLabel maps a path to the status bar's language token. Curated extensions get a fixed label;
// unknown extensions uppercase their extension; extensionless / trailing-dot paths fall back to TEXT.

describe("languageLabel", () => {
  it("labels curated extensions", () => {
    expect(languageLabel("src/a.tsx")).toBe("TSX");
    expect(languageLabel("src/a.ts")).toBe("TS");
    expect(languageLabel("vendor.js")).toBe("JS");
    expect(languageLabel("data.json")).toBe("JSON");
    expect(languageLabel("README.md")).toBe("MD");
  });

  it("uppercases an unknown extension", () => {
    expect(languageLabel("Cargo.toml")).toBe("TOML");
    expect(languageLabel("main.go")).toBe("GO");
  });

  it("falls back to TEXT without a usable extension", () => {
    expect(languageLabel("Makefile")).toBe("TEXT");
    expect(languageLabel("weird.")).toBe("TEXT");
  });

  it("is case-insensitive on the extension", () => {
    expect(languageLabel("A.TSX")).toBe("TSX");
  });
});
