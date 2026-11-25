import { describe, expect, it } from "bun:test";

import { UploadRules } from "./upload-rules";

const valid = { fileId: "abc123", mimeType: "image/png", size: 1024 };
const codeOf = (input: Parameters<typeof UploadRules.validateUpload>[0]) => {
  const result = UploadRules.validateUpload(input);
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
    expect(codeOf({ ...valid, size: UploadRules.MAX_FILE_BYTES })).toBe("ok");
    expect(codeOf({ ...valid, size: UploadRules.MAX_FILE_BYTES + 1 })).toBe(
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

describe("validateArtifact", () => {
  const text = (n: number) => new Uint8Array(n).fill(0x61);
  const check = (
    input: Partial<Parameters<typeof UploadRules.validateArtifact>[0]>
  ) =>
    UploadRules.validateArtifact({
      format: "html",
      name: "report.html",
      bytes: text(10),
      ...input,
    });
  const codeOfArtifact = (input: Parameters<typeof check>[0]) => {
    const result = check(input);
    return result.isErr() ? result.error.code : "ok";
  };

  it("stores html and markdown under their text mime types", () => {
    const html = check({});
    const md = check({ format: "markdown" });
    expect(html.isOk() && html.value.mimeType).toBe("text/html");
    expect(md.isOk() && md.value.mimeType).toBe("text/markdown");
  });

  it("allows exactly 1 MiB and rejects one byte more with 413", () => {
    expect(
      codeOfArtifact({ bytes: text(UploadRules.MAX_ARTIFACT_BYTES) })
    ).toBe("ok");
    expect(
      codeOfArtifact({ bytes: text(UploadRules.MAX_ARTIFACT_BYTES + 1) })
    ).toBe("PayloadTooLarge");
  });

  it("rejects empty content, unknown formats and bad names", () => {
    expect(codeOfArtifact({ bytes: text(0) })).toBe("ValidationFailed");
    expect(codeOfArtifact({ format: "pdf" })).toBe("ValidationFailed");
    expect(codeOfArtifact({ format: "toString" })).toBe("ValidationFailed");
    expect(codeOfArtifact({ name: "   " })).toBe("ValidationFailed");
    expect(codeOfArtifact({ name: "a".repeat(201) })).toBe("ValidationFailed");
  });

  it("trims the name", () => {
    const result = check({ name: "  notes.md  " });
    expect(result.isOk() && result.value.name).toBe("notes.md");
  });
});
