export interface IFileStorage {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  stream(key: string): ReadableStream<Uint8Array>;
  deletePrefix(prefix: string): Promise<void>;
}
