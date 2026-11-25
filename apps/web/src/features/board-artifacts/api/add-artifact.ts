import { api, unwrap } from "@/shared/api";

import type { ArtifactFormat } from "../model/artifact-file";

export const addArtifact = async ({
  boardId,
  shareToken,
  ...body
}: {
  boardId: string;
  shareToken?: string;
  name: string;
  format: ArtifactFormat;
  content: string;
  pageId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) =>
  unwrap(
    await api.api
      .boards({ id: boardId })
      .artifacts.post(body, { query: { share: shareToken } })
  );
