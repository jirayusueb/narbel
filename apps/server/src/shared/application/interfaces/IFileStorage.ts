export interface StoredObject {
  size: number;
  type: string;
}

export interface IFileStorage {
  /** Presigned PUT the browser uploads to directly. */
  presignUpload(
    key: string,
    mimeType: string,
    expiresInSeconds: number
  ): string;
  stream(key: string): ReadableStream<Uint8Array>;
  /** null when nothing is stored under the key. */
  stat(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}
