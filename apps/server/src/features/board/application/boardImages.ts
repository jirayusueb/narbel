import type { IFileStorage } from "../../../shared/application/interfaces/IFileStorage";
import type { ImageData } from "../domain/rendering/sceneSvg";
import { readImageHeader } from "../domain/rules/imageHeader";
import { MAX_IMAGE_PIXELS } from "../domain/rules/UploadRules";
import { boardFileKey } from "../domain/values/FileKey";
import type { IBoardFileRepository } from "./ports/IBoardFileRepository";

export const MAX_RENDER_BYTES = 32 * 1024 * 1024;
export const MAX_EXPORT_BYTES = 8 * 1024 * 1024;

const HEADER_BYTES = 64 * 1024;

const readHead = async (storage: IFileStorage, key: string) => {
  const chunks: Uint8Array[] = [];
  let length = 0;
  // breaking out of for-await cancels the stream, so a large object is not downloaded
  for await (const chunk of storage.stream(key)) {
    chunks.push(chunk);
    length += chunk.length;
    if (length >= HEADER_BYTES) {
      break;
    }
  }
  return Buffer.concat(chunks).subarray(0, HEADER_BYTES);
};

// Uploads through the presigned PUT are never inspected, so the declared pixel count is checked here before any decode.
const withinPixelLimit = async (storage: IFileStorage, key: string) => {
  const header = readImageHeader(await readHead(storage, key));
  const size = header?.size;
  return (
    header !== null && (!size || size.width * size.height <= MAX_IMAGE_PIXELS)
  );
};

export const loadBoardImages = async (
  files: IBoardFileRepository,
  storage: IFileStorage,
  boardId: string,
  fileIds: string[],
  maxBytes: number
) => {
  const unique = [...new Set(fileIds)];
  const found = await Promise.all(
    unique.map(async (fileId) => {
      const file = await files.findById(boardId, fileId);
      const key = boardFileKey(boardId, fileId);
      // The presigned PUT does not bind the declared size, so budget on what storage holds.
      const stored = file && (await storage.stat(key));
      return file && stored && (await withinPixelLimit(storage, key))
        ? { fileId, key, mimeType: file.mimeType, size: stored.size }
        : null;
    })
  );
  let budget = maxBytes;
  const chosen = found.filter((f) => {
    if (!f || f.size > budget) {
      return false;
    }
    budget -= f.size;
    return true;
  });
  const images = new Map<string, ImageData>();
  await Promise.all(
    chosen.map(async (f) => {
      if (!f) {
        return;
      }
      const bytes = await new Response(storage.stream(f.key)).bytes();
      images.set(f.fileId, {
        mimeType: f.mimeType,
        base64: Buffer.from(bytes).toString("base64"),
      });
    })
  );
  return { images, omitted: unique.filter((id) => !images.has(id)) };
};
