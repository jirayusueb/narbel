import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

export interface BoardComment {
  id: string;
  pageId: string;
  x: number;
  y: number;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  resolvedAt: string | null;
  parentId: string | null;
}

const POLL_MS = 5000;

const key = (boardId: string, pageId: string | null) =>
  ["boards", boardId, "comments", pageId] as const;

export const useComments = (
  boardId: string,
  pageId: string | null,
  share?: string
) =>
  useQuery({
    queryKey: key(boardId, pageId),
    queryFn: async (): Promise<BoardComment[]> =>
      unwrap(
        await api.api
          .boards({ id: boardId })
          .comments.get({ query: { pageId: pageId ?? "", share } })
      ),
    enabled: pageId !== null,
    refetchInterval: POLL_MS,
  });

export const useCommentMutations = (
  boardId: string,
  pageId: string | null,
  share?: string
) => {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: key(boardId, pageId) });
  const query = { share };
  const { comments } = api.api.boards({ id: boardId });

  return {
    create: useMutation({
      mutationFn: async (input: { x: number; y: number; body: string }) =>
        unwrap(
          await comments.post({ pageId: pageId ?? "", ...input }, { query })
        ),
      onSuccess,
    }),
    resolve: useMutation({
      mutationFn: async (commentId: string) =>
        unwrap(
          await comments({ commentId }).resolve.post(undefined, { query })
        ),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (commentId: string) =>
        unwrap(await comments({ commentId }).delete(undefined, { query })),
      onSuccess,
    }),
  };
};
