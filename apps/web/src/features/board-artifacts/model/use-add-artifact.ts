import { viewportCoordsToSceneCoords } from "@narbel/ndraw";
import type { ExcalidrawImperativeAPI } from "@narbel/ndraw/types";
import { useCallback } from "react";
import { toast } from "sonner";

import { addArtifact } from "../api/add-artifact";
import {
  ARTIFACT_SIZE,
  MAX_ARTIFACT_BYTES,
  artifactFileOf,
} from "./artifact-file";

/**
 * Posts a file as an artifact centred on a viewport point (the viewport centre by default). The server
 * inserts the element, which then arrives through the room sync, so nothing is added locally.
 */
export const useAddArtifact = ({
  boardId,
  shareToken,
  api,
  pageId,
}: {
  boardId: string;
  shareToken?: string;
  api: ExcalidrawImperativeAPI | null;
  pageId: string | null;
}) =>
  useCallback(
    async (file: File, at?: { clientX: number; clientY: number }) => {
      const meta = artifactFileOf(file);
      if (!api) {
        return;
      }
      if (!meta) {
        toast.error(`${file.name} is not an HTML or Markdown file`);
        return;
      }
      if (file.size > MAX_ARTIFACT_BYTES) {
        toast.error(`${file.name} is larger than 1 MiB`);
        return;
      }
      const state = api.getAppState();
      const centre = viewportCoordsToSceneCoords(
        at ?? {
          clientX: state.offsetLeft + state.width / 2,
          clientY: state.offsetTop + state.height / 2,
        },
        state
      );
      try {
        await addArtifact({
          boardId,
          shareToken,
          ...meta,
          content: await file.text(),
          pageId: pageId ?? undefined,
          x: centre.x - ARTIFACT_SIZE.width / 2,
          y: centre.y - ARTIFACT_SIZE.height / 2,
          ...ARTIFACT_SIZE,
        });
      } catch (error) {
        toast.error(`Could not add ${file.name}: ${(error as Error).message}`);
      }
    },
    [boardId, shareToken, api, pageId]
  );
