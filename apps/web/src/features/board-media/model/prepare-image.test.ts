import { expect, test } from "bun:test";

import { fitWithin, isRecompressible, pickSmaller } from "./prepare-image";

const webp = (bytes: number) =>
  new Blob([new Uint8Array(bytes)], { type: "image/webp" });

const png = (bytes: number) => ({
  blob: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
  mimeType: "image/png",
});

test("animated and vector images are never re-encoded", () => {
  expect(isRecompressible("image/gif")).toBe(false);
  expect(isRecompressible("image/svg+xml")).toBe(false);
  expect(isRecompressible("image/png")).toBe(true);
  expect(isRecompressible("image/jpeg")).toBe(true);
});

test("long side is capped without upscaling", () => {
  expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  expect(fitWithin(10_000, 1, 2048).height).toBe(1);
});

test("the original is kept unless a smaller real WebP came out", () => {
  const original = png(1000);
  expect(pickSmaller(original, webp(400)).mimeType).toBe("image/webp");
  expect(pickSmaller(original, webp(1000))).toBe(original);
  expect(pickSmaller(original, webp(2000))).toBe(original);
  const fallbackPng = new Blob([new Uint8Array(10)], { type: "image/png" });
  expect(pickSmaller(original, fallbackPng)).toBe(original);
});
