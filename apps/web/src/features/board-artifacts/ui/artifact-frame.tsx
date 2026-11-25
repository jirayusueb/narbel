import type { ExcalidrawIframeLikeElement } from "@narbel/ndraw/element/types";
import type { AppState } from "@narbel/ndraw/types";
import { useQuery } from "@tanstack/react-query";

import { downloadAsText } from "@/entities/board";

import type { ArtifactFormat } from "../model/artifact-file";

const MIME: Record<ArtifactFormat, string> = {
  html: "text/html",
  markdown: "text/markdown",
};

const MARKDOWN_STYLE =
  "body{font:16px/1.6 system-ui,sans-serif;margin:16px;color:#1b1b1f;background:#fff}img{max-width:100%}pre{overflow:auto;background:#f4f4f5;padding:12px;border-radius:6px}code{font-family:ui-monospace,monospace}blockquote{margin-left:0;padding-left:12px;border-left:3px solid #d4d4d8;color:#52525b}table{border-collapse:collapse}td,th{border:1px solid #d4d4d8;padding:4px 8px}";

const loadSource = async (
  boardId: string,
  fileId: string,
  format: ArtifactFormat,
  shareToken?: string
) => {
  const { text, contentType } = await downloadAsText(
    boardId,
    fileId,
    shareToken
  );
  if (!contentType.startsWith(MIME[format])) {
    throw new Error("Unexpected content type");
  }
  if (format === "html") {
    return text;
  }
  const { marked } = await import("marked");
  const body = await marked.parse(text);
  return `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${MARKDOWN_STYLE}</style>${body}`;
};

const Note = ({ children }: { children: string }) => (
  <div className="text-muted-foreground flex flex-1 items-center justify-center bg-white p-4 text-center text-sm">
    {children}
  </div>
);

export const ArtifactFrame = ({
  boardId,
  shareToken,
  fileId,
  name,
  format,
  active,
}: {
  boardId: string;
  shareToken?: string;
  fileId: string;
  name: string;
  format: ArtifactFormat;
  active: boolean;
}) => {
  const { data, isPending, isError } = useQuery({
    queryKey: ["board-artifact", boardId, fileId, format],
    queryFn: () => loadSource(boardId, fileId, format, shareToken),
    staleTime: Number.POSITIVE_INFINITY,
    // a missing file (imported, or pasted from another board) never comes back; say so at once
    retry: false,
  });

  let body = <Note>Loading…</Note>;
  if (isError) {
    body = <Note>Could not load this artifact</Note>;
  } else if (!isPending && format === "markdown") {
    body = (
      <iframe
        title={name}
        sandbox="allow-popups"
        srcDoc={data}
        className="w-full flex-1 border-0 bg-white"
      />
    );
  } else if (!isPending && active) {
    body = (
      <iframe
        title={name}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
        srcDoc={data}
        className="w-full flex-1 border-0 bg-white"
      />
    );
  } else if (!isPending) {
    body = <Note>{`${name} · Click to run`}</Note>;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-sm border border-zinc-300 bg-zinc-100">
      <div className="truncate px-2 py-1 text-xs text-zinc-600">
        {name} · {format}
      </div>
      {body}
    </div>
  );
};

const artifactOf = (element: ExcalidrawIframeLikeElement) => {
  const artifact = (
    element.customData as
      | { artifact?: { format?: ArtifactFormat; name?: string } }
      | undefined
  )?.artifact;
  const { fileId } = element as { fileId?: unknown };
  const format = artifact?.format;
  if (
    !(format && Object.hasOwn(MIME, format)) ||
    !artifact?.name ||
    typeof fileId !== "string"
  ) {
    return null;
  }
  return { fileId, name: artifact.name, format };
};

export const createArtifactRenderer = ({
  boardId,
  shareToken,
}: {
  boardId: string;
  shareToken?: string;
}) =>
  function renderArtifact(
    element: ExcalidrawIframeLikeElement,
    appState: AppState
  ) {
    const artifact = artifactOf(element);
    if (!artifact) {
      return null;
    }
    const { activeEmbeddable } = appState;
    return (
      <ArtifactFrame
        boardId={boardId}
        shareToken={shareToken}
        {...artifact}
        active={
          activeEmbeddable?.element.id === element.id &&
          activeEmbeddable.state === "active"
        }
      />
    );
  };
