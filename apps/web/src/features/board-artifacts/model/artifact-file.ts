export type ArtifactFormat = "html" | "markdown";

export const MAX_ARTIFACT_BYTES = 1024 * 1024;
export const ARTIFACT_SIZE = { width: 640, height: 480 } as const;

const FORMAT_BY_EXTENSION: Record<string, ArtifactFormat> = {
  ".html": "html",
  ".htm": "html",
  ".md": "markdown",
  ".markdown": "markdown",
};

/** The artifact name and format for a file, or null when its extension is not one we render. */
export const artifactFileOf = (file: { name: string }) => {
  const dot = file.name.lastIndexOf(".");
  const format =
    dot === -1
      ? undefined
      : FORMAT_BY_EXTENSION[file.name.slice(dot).toLowerCase()];
  return format ? { name: file.name, format } : null;
};
