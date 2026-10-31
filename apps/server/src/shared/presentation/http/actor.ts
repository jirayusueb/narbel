import { t } from "elysia";

import type { Actor } from "../../kernel/types/Actor";

/** Share links carry their token as `?share=`; declared so typed clients may pass it. */
export const shareQuery = t.Object({ share: t.Optional(t.String()) });

export const unlockCookieName = (boardId: string) => `board_unlock_${boardId}`;

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Collects every proof of access the request carries; the use cases decide what it is worth. */
export const actorFrom = (
  request: Request,
  user: SessionUser | null | undefined,
  boardId: string
): Actor => {
  const cookies = new Bun.CookieMap(request.headers.get("cookie") ?? "");
  return {
    userId: user?.id,
    email: user?.email,
    name: user?.name,
    shareToken:
      new URL(request.url).searchParams.get("share") ??
      request.headers.get("x-share-token") ??
      undefined,
    unlockProof: cookies.get(unlockCookieName(boardId)) ?? undefined,
  };
};

/** Actor for an authenticated, non-board-scoped caller such as MCP. */
export const userActor = (user: SessionUser): Actor => ({
  userId: user.id,
  email: user.email,
  name: user.name,
});
