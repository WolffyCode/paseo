import { describe, expect, it } from "vitest";
import { toImageDataUri } from "./image-data";

// toImageDataUri turns image bytes into a data URI the <Image> preview renders. The base64 payload must
// match the canonical RFC 4648 encoding (incl. `=` padding on the trailing 1/2-byte groups), and the mime
// is carried verbatim (with a binary fallback when absent).

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("toImageDataUri", () => {
  it("encodes a 3-byte group with no padding", () => {
    expect(toImageDataUri(enc("Man"), "image/png")).toBe("data:image/png;base64,TWFu");
  });

  it("pads a 1-byte tail with ==", () => {
    expect(toImageDataUri(enc("M"), "image/gif")).toBe("data:image/gif;base64,TQ==");
  });

  it("pads a 2-byte tail with =", () => {
    expect(toImageDataUri(enc("Ma"), "image/jpeg")).toBe("data:image/jpeg;base64,TWE=");
  });

  it("encodes a longer run across group boundaries", () => {
    expect(toImageDataUri(enc("hello"), "image/webp")).toBe("data:image/webp;base64,aGVsbG8=");
  });

  it("falls back to a binary mime when none is given", () => {
    expect(toImageDataUri(enc(""), "")).toBe("data:application/octet-stream;base64,");
  });
});
