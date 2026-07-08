import { describe, expect, it } from "vitest";
import { classifyDocumentKind } from "./document-kind";

// classifyDocumentKind maps a read file to how the file tab renders it. Markdown is decided by the
// shell's own extension check FIRST (case-insensitive .md/.markdown, so .mdx / .md.txt are excluded);
// code by the shared highlight language support; image/binary by the host's own read classification
// (FileReadResult.kind already folds mime host-side). Everything else is plain text.

describe("classifyDocumentKind · markdown", () => {
  // .md / .markdown are markdown regardless of case — the host reads them as text, so the extension
  // check must win before the code/text fallbacks.
  it("classifies .md and .markdown (case-insensitive) as markdown", () => {
    expect(classifyDocumentKind({ path: "README.md", readKind: "text" })).toBe("markdown");
    expect(classifyDocumentKind({ path: "notes.MARKDOWN", readKind: "text" })).toBe("markdown");
    expect(classifyDocumentKind({ path: "a.MD", readKind: "text" })).toBe("markdown");
  });

  // .mdx and .md.txt are NOT markdown (the endsWith check excludes them naturally); they fall through
  // to code (.mdx is language-supported) / text (.md.txt is not).
  it("excludes .mdx and .md.txt from markdown", () => {
    expect(classifyDocumentKind({ path: "doc.mdx", readKind: "text" })).not.toBe("markdown");
    expect(classifyDocumentKind({ path: "doc.md.txt", readKind: "text" })).toBe("text");
  });
});

describe("classifyDocumentKind · code vs text", () => {
  // A language the shared highlighter supports is code (syntax-highlighted editor).
  it("classifies a supported language as code", () => {
    expect(classifyDocumentKind({ path: "src/a.ts", readKind: "text" })).toBe("code");
    expect(classifyDocumentKind({ path: "main.py", readKind: "text" })).toBe("code");
  });

  // An unsupported text extension is plain text.
  it("classifies an unsupported text file as text", () => {
    expect(classifyDocumentKind({ path: "notes.txt", readKind: "text" })).toBe("text");
    expect(classifyDocumentKind({ path: "data.csv", readKind: "text" })).toBe("text");
  });
});

describe("classifyDocumentKind · image and binary", () => {
  // The host's read kind decides image/binary (it already used mime to classify); a .png is an image.
  it("classifies a host-read image as image", () => {
    expect(classifyDocumentKind({ path: "logo.png", readKind: "image" })).toBe("image");
  });

  // A host-read binary is binary (read-only fallback).
  it("classifies a host-read binary as binary", () => {
    expect(classifyDocumentKind({ path: "app.wasm", readKind: "binary" })).toBe("binary");
  });
});
