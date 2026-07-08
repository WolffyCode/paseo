// Build a base64 data URI for a read-only image file's bytes so the image preview can render it directly
// through <Image> (desktop/web). Base64 is encoded by hand so this stays a pure, environment-agnostic
// function (runs in the node test env AND the web runtime) with no Buffer/btoa dependency. Images have no
// editor buffer, so — unlike editable text — the model IS the only home for their content; this is that
// content's single source, not a mirror of anything.

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Compose the `data:<mime>;base64,<payload>` URI (falling back to a generic binary mime when none given).
export function toImageDataUri(bytes: Uint8Array, mime: string): string {
  const type = mime.trim() || "application/octet-stream";
  return `data:${type};base64,${base64FromBytes(bytes)}`;
}

// Standard base64 over the raw bytes, three input bytes → four output chars, `=`-padding the final group.
function base64FromBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64_ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
}
