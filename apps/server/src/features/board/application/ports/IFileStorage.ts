export interface IFileStorage {
  /** Presigned PUT the browser uploads to directly. */
  presignUpload(key: string, mimeType: string, expiresInSeconds: number): string;
  stream(key: string): ReadableStream<Uint8Array>;
  deletePrefix(prefix: string): Promise<void>;
}
