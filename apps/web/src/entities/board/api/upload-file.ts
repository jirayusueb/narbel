import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { api as http, unwrap } from "@/shared/api";

import { prepareImage } from "../model/prepare-image";

/**
 * Presigns, then PUTs the image straight to storage. Resolves with the stored mime type only once
 * the PUT succeeded, so callers can publish the image element after it.
 */
export const uploadBoardFile = async (
  boardId: string,
  file: BinaryFileData,
  shareToken?: string
) => {
  const source = await fetch(file.dataURL);
  const blob = await source.blob();
  const prepared = await prepareImage({
    blob,
    mimeType: file.mimeType,
  });
  const { uploadUrl } = unwrap(
    await http.api.boards({ id: boardId }).files.presign.post(
      {
        fileId: file.id,
        mimeType: prepared.mimeType,
        size: prepared.blob.size,
      },
      { query: { share: shareToken } }
    )
  );
  // The URL is signed for this exact content type and length; S3 gets the bytes directly, no cookies.
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": prepared.mimeType },
    body: prepared.blob,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return prepared.mimeType;
};
