import { S3Client } from "bun";

import type { IFileStorage } from "../../application/ports/IFileStorage";

export interface S3Config {
  S3_ENDPOINT: string;
  S3_REGION: string;
  S3_BUCKET: string;
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
}

export class BunS3FileStorage implements IFileStorage {
  private readonly client: S3Client;

  constructor(config: S3Config) {
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
  }

  presignUpload(key: string, mimeType: string, expiresInSeconds: number) {
    return this.client.presign(key, {
      method: "PUT",
      type: mimeType,
      expiresIn: expiresInSeconds,
    });
  }

  stream(key: string) {
    return this.client.file(key).stream();
  }

  async deletePrefix(prefix: string, continuationToken?: string) {
    const page = await this.client.list({ prefix, continuationToken });
    await Promise.all(
      (page.contents ?? []).map((object) => this.client.delete(object.key))
    );
    if (page.isTruncated && page.nextContinuationToken) {
      await this.deletePrefix(prefix, page.nextContinuationToken);
    }
  }
}
