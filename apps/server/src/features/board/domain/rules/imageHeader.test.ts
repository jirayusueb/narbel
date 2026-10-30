import { describe, expect, it } from "bun:test";

import { readImageHeader } from "./imageHeader";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) =>
      typeof p === "string" ? [...p].map((c) => c.codePointAt(0) ?? 0) : p
    )
  );
const u32 = (n: number, little: boolean) => {
  const out = Buffer.alloc(4);
  if (little) {
    out.writeUInt32LE(n);
  } else {
    out.writeUInt32BE(n);
  }
  return [...out];
};
const le32 = (n: number) => u32(n, true);
const be32 = (n: number) => u32(n, false);

describe("readImageHeader", () => {
  it("reads a PNG", () => {
    const png = bytes(
      [0x89],
      "PNG\r\n",
      [0x1a, 0x0a],
      [0, 0, 0, 13],
      "IHDR",
      be32(3),
      be32(2),
      [8, 6, 0, 0, 0]
    );
    expect(readImageHeader(png)).toEqual({
      mimeType: "image/png",
      size: { width: 3, height: 2 },
    });
  });

  it("reads a GIF", () => {
    const gif = bytes("GIF89a", [5, 0, 7, 0, 0, 0, 0]);
    expect(readImageHeader(gif)).toEqual({
      mimeType: "image/gif",
      size: { width: 5, height: 7 },
    });
  });

  it.each([0xc0, 0xc2])(
    "reads a JPEG with SOF marker %i, skipping other segments",
    (sof) => {
      const jpeg = bytes(
        [0xff, 0xd8],
        [0xff, 0xe0, 0, 4, 0, 0],
        [0xff, sof, 0, 11, 8, 0, 9, 1, 0, 3, 1, 0x11, 0]
      );
      expect(readImageHeader(jpeg)).toEqual({
        mimeType: "image/jpeg",
        size: { width: 256, height: 9 },
      });
    }
  );

  it("reads the three WebP flavours", () => {
    const riff = (chunk: string, body: number[]) =>
      bytes("RIFF", le32(30), "WEBP", chunk, le32(body.length), body);
    const lossy = riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, 40, 0, 30, 0, 0, 0]);
    // VP8L packs width-1 and height-1 into 14 bits each
    const packed = 99 + 49 * 16_384;
    const lossless = riff("VP8L", [0x2f, ...le32(packed), 0, 0, 0, 0, 0, 0, 0]);
    const extended = riff("VP8X", [0, 0, 0, 0, 119, 0, 0, 59, 0, 0, 0, 0]);
    expect(readImageHeader(lossy)?.size).toEqual({ width: 40, height: 30 });
    expect(readImageHeader(lossless)?.size).toEqual({ width: 100, height: 50 });
    expect(readImageHeader(extended)).toEqual({
      mimeType: "image/webp",
      size: { width: 120, height: 60 },
    });
  });

  it("reads SVG width/height, falls back to viewBox, and tolerates no size", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(
      readImageHeader(
        enc(
          '<?xml version="1.0"?><svg xmlns="x" width="64px" height="32"></svg>'
        )
      )
    ).toEqual({
      mimeType: "image/svg+xml",
      size: { width: 64, height: 32 },
    });
    expect(
      readImageHeader(enc('<svg viewBox="0 0 10 20" width="100%"/>'))?.size
    ).toEqual({ width: 10, height: 20 });
    expect(readImageHeader(enc("<svg></svg>"))).toEqual({
      mimeType: "image/svg+xml",
    });
  });

  it("rejects bytes that are not a supported image", () => {
    expect(readImageHeader(bytes("hello world, not an image"))).toBeNull();
    expect(readImageHeader(bytes())).toBeNull();
    expect(readImageHeader(bytes([0x89], "PNG"))).toBeNull();
  });
});
