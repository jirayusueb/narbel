import type { IFileStorage } from "../../../shared/application/interfaces/IFileStorage";
import type { ImageData } from "../domain/rendering/sceneSvg";
import { boardFileKey } from "../domain/values/FileKey";
import type { IBoardFileRepository } from "./ports/IBoardFileRepository";

// One call holds every image in memory as base64; past this the rest are left out.
const MAX_EMBEDDED_BYTES = 32 * 1024 * 1024;

/** Files that are unknown, gone from storage, or past the byte budget are left out of the result. */
export const loadBoardImages = async (
  files: IBoardFileRepository,
  storage: IFileStorage,
  boardId: string,
  fileIds: string[]
) => {
  const found = await Promise.all(
    [...new Set(fileIds)].map(async (fileId) => {
      const file = await files.findById(boardId, fileId);
      const key = boardFileKey(boardId, fileId);
      // The presigned PUT does not bind the declared size, so budget on what storage holds.
      const stored = file && (await storage.stat(key));
      return file && stored
        ? { fileId, key, mimeType: file.mimeType, size: stored.size }
        : null;
    })
  );
  let budget = MAX_EMBEDDED_BYTES;
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
  return images;
};
