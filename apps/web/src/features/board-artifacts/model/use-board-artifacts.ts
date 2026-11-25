import type { ExcalidrawImperativeAPI } from "@narbel/ndraw/types";
import { useFileDialog } from "@reactuses/core";
import { useMemo } from "react";

import { createArtifactRenderer } from "../ui/artifact-frame";
import { useAddArtifact } from "./use-add-artifact";
import { useArtifactDrop } from "./use-artifact-drop";

const ACCEPT = ".html,.htm,.md,.markdown,text/html,text/markdown";

/** Everything the board canvas needs to render and add artifacts; adding is undefined when read-only. */
export const useBoardArtifacts = ({
  boardId,
  shareToken,
  api,
  pageId,
  canWrite,
}: {
  boardId: string;
  shareToken?: string;
  api: ExcalidrawImperativeAPI | null;
  pageId: string | null;
  canWrite: boolean;
}) => {
  const renderEmbeddable = useMemo(
    () => createArtifactRenderer({ boardId, shareToken }),
    [boardId, shareToken]
  );
  const add = useAddArtifact({ boardId, shareToken, api, pageId });
  const onDropCapture = useArtifactDrop({ canWrite, onAdd: add });
  // owned here, not by the menu item, which unmounts as the menu closes
  const [, openFileDialog] = useFileDialog({ multiple: false, accept: ACCEPT });
  const onAddArtifact = canWrite
    ? async () => {
        const files = await openFileDialog();
        const file = files?.[0];
        if (file) {
          await add(file);
        }
      }
    : undefined;
  return { renderEmbeddable, onDropCapture, onAddArtifact };
};
