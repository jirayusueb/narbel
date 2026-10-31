import type { BoardImage } from "../../application/usecases/RenderBoardImage";

/** 204 when the page has nothing to draw. The URL carries `v=updatedAt`, so a cached PNG never goes stale. */
export const previewResponse = ({ image }: Pick<BoardImage, "image">) =>
  image
    ? new Response(image.png, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      })
    : new Response(null, { status: 204 });
