const MAX_SIDE = 2048;
const WEBP_QUALITY = 0.82;
const WEBP = "image/webp";
const KEEP_AS_IS = new Set(["image/gif", "image/svg+xml"]);

export interface Prepared {
  blob: Blob;
  mimeType: string;
}

export const isRecompressible = (mimeType: string) => !KEEP_AS_IS.has(mimeType);

export const fitWithin = (width: number, height: number, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

// A browser that cannot encode WebP silently returns PNG, which is no win.
export const pickSmaller = (original: Prepared, encoded: Blob): Prepared =>
  encoded.type === WEBP && encoded.size < original.blob.size
    ? { blob: encoded, mimeType: WEBP }
    : original;

const encodeWebp = (bitmap: ImageBitmap) => {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: WEBP, quality: WEBP_QUALITY });
};

export const prepareImage = async (original: Prepared): Promise<Prepared> => {
  if (!isRecompressible(original.mimeType)) {
    return original;
  }
  try {
    const bitmap = await createImageBitmap(original.blob);
    try {
      return pickSmaller(original, await encodeWebp(bitmap));
    } finally {
      bitmap.close();
    }
  } catch {
    return original;
  }
};
