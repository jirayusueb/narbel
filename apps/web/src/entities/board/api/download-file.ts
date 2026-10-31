import { SERVER_URL } from "@/shared/config";

const BASE64_CHUNK = 0x80_00;

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + BASE64_CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
};

/** A stored board image as the data URL Excalidraw's files map expects. */
export const downloadAsDataUrl = async (
  boardId: string,
  fileId: string,
  shareToken?: string
) => {
  const query = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
  const res = await fetch(
    `${SERVER_URL}/api/boards/${boardId}/files/${fileId}${query}`,
    { credentials: "include" }
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return blobToDataUrl(await res.blob());
};
