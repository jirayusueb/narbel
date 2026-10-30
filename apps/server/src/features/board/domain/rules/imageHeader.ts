export interface ImageHeader {
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp"
    | "image/svg+xml";
  size?: { width: number; height: number };
}

const ascii = (b: Uint8Array, at: number, text: string) =>
  [...text].every((c, i) => b[at + i] === c.codePointAt(0));
const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength);
const le24 = (b: Uint8Array, at: number) =>
  view(b).getUint16(at, true) + (b[at + 2] ?? 0) * 65_536;

const sized = (
  mimeType: ImageHeader["mimeType"],
  width: number,
  height: number
) => (width > 0 && height > 0 ? { mimeType, size: { width, height } } : null);

const png = (b: Uint8Array) =>
  b.length >= 24 && ascii(b, 12, "IHDR")
    ? sized("image/png", view(b).getUint32(16), view(b).getUint32(20))
    : null;

const gif = (b: Uint8Array) =>
  b.length >= 10
    ? sized("image/gif", view(b).getUint16(6, true), view(b).getUint16(8, true))
    : null;

// SOF markers (C0-CF) except DHT, JPG and DAC carry the frame size; progressive is SOF2.
const SOF_EXCLUDED = new Set([0xc4, 0xc8, 0xcc]);
const STANDALONE = (marker: number) =>
  marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

const jpeg = (b: Uint8Array) => {
  let at = 2;
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) {
      return null;
    }
    const marker = b[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
    } else if (marker >= 0xc0 && marker <= 0xcf && !SOF_EXCLUDED.has(marker)) {
      return at + 9 <= b.length
        ? sized(
            "image/jpeg",
            view(b).getUint16(at + 7),
            view(b).getUint16(at + 5)
          )
        : null;
    } else if (STANDALONE(marker)) {
      at += 2;
    } else {
      at += 2 + view(b).getUint16(at + 2);
    }
  }
  return null;
};

const FOURTEEN_BITS = 16_384;

const webp = (b: Uint8Array) => {
  if (b.length < 30) {
    return null;
  }
  if (ascii(b, 12, "VP8 ")) {
    return sized(
      "image/webp",
      view(b).getUint16(26, true) % FOURTEEN_BITS,
      view(b).getUint16(28, true) % FOURTEEN_BITS
    );
  }
  if (ascii(b, 12, "VP8L") && b[20] === 0x2f) {
    // width-1 and height-1 packed into 14 bits each
    const bits = view(b).getUint32(21, true);
    return sized(
      "image/webp",
      (bits % FOURTEEN_BITS) + 1,
      (Math.floor(bits / FOURTEEN_BITS) % FOURTEEN_BITS) + 1
    );
  }
  if (ascii(b, 12, "VP8X")) {
    return sized("image/webp", le24(b, 24) + 1, le24(b, 27) + 1);
  }
  return null;
};

const attr = (tag: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "u").exec(tag)?.[1];
const px = (value: string | undefined) => {
  const n = Number(
    /^\s*(?<n>[\d.]+)\s*(?:px)?\s*$/u.exec(value ?? "")?.groups?.n
  );
  return n > 0 ? n : undefined;
};

const svg = (b: Uint8Array): ImageHeader | null => {
  const head = new TextDecoder().decode(b.subarray(0, 4096));
  const tag = /<svg[\s>][^>]*>/u.exec(head)?.[0];
  if (!tag) {
    return null;
  }
  const width = px(attr(tag, "width"));
  const height = px(attr(tag, "height"));
  if (width && height) {
    return { mimeType: "image/svg+xml", size: { width, height } };
  }
  const box =
    attr(tag, "viewBox")
      ?.trim()
      .split(/[\s,]+/u)
      .map(Number) ?? [];
  const [w, h] = box.slice(2);
  return w && h && w > 0 && h > 0
    ? { mimeType: "image/svg+xml", size: { width: w, height: h } }
    : { mimeType: "image/svg+xml" };
};

export const readImageHeader = (b: Uint8Array): ImageHeader | null => {
  if (b[0] === 0x89 && ascii(b, 1, "PNG")) {
    return png(b);
  }
  if (ascii(b, 0, "GIF8")) {
    return gif(b);
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    return jpeg(b);
  }
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
    return webp(b);
  }
  return svg(b);
};
