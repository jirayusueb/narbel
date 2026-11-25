import { useCallback } from "react";
import type { DragEvent } from "react";

import { artifactFileOf } from "./artifact-file";

/** onDropCapture for the canvas wrapper: claims drops of artifact files before ndraw's own handler sees them. */
export const useArtifactDrop = ({
  canWrite,
  onAdd,
}: {
  canWrite: boolean;
  onAdd: (file: File, at: { clientX: number; clientY: number }) => void;
}) =>
  useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!canWrite) {
        return;
      }
      // only a lone artifact file is ours; any other drop, mixed ones included, stays ndraw's
      const [file, ...others] = event.dataTransfer.files;
      if (!file || others.length > 0 || !artifactFileOf(file)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onAdd(file, { clientX: event.clientX, clientY: event.clientY });
    },
    [canWrite, onAdd]
  );
