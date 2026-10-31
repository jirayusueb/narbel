import { describe, expect, it } from "bun:test";

import { MAX_FILE_BYTES, validateUpload } from "./UploadRules";

const valid = { fileId: "abc123", mimeType: "image/png", size: 1024 };
const codeOf = (input: Parameters<typeof validateUpload>[0]) => {
  const result = validateUpload(input);
  return result.isErr() ? result.error.code : "ok";
};

describe("validateUpload", () => {
  it("accepts every allowed image type", () => {
    for (const mimeType of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ]) {
      expect(codeOf({ ...valid, mimeType })).toBe("ok");
    }
  });

  it("rejects non-image and unlisted image types with 415", () => {
    expect(codeOf({ ...valid, mimeType: "application/pdf" })).toBe(
      "UnsupportedMediaType"
    );
    expect(codeOf({ ...valid, mimeType: "image/tiff" })).toBe(
      "UnsupportedMediaType"
    );
  });

  it("allows exactly 10 MiB and rejects one byte more with 413", () => {
    expect(codeOf({ ...valid, size: MAX_FILE_BYTES })).toBe("ok");
    expect(codeOf({ ...valid, size: MAX_FILE_BYTES + 1 })).toBe(
      "PayloadTooLarge"
    );
  });

  it("rejects empty files", () => {
    expect(codeOf({ ...valid, size: 0 })).toBe("ValidationFailed");
  });

  it("rejects fileIds that could escape the board's key prefix", () => {
    for (const fileId of ["", "../x", "a/b", "a b", "x".repeat(129)]) {
      expect(codeOf({ ...valid, fileId })).toBe("ValidationFailed");
    }
  });
});
