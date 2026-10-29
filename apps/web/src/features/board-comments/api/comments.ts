import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

const PAGE = 20;
const POLL_MS = 5000;

const fetchThreads = async (
  boardId: string,
  query: {
    pageId?: string;
    status: "open" | "resolved" | "all";
    cursor?: string;
    limit: number;
    share?: string;
  }
) => unwrap(await api.api.boards({ id: boardId }).comments.get({ query }));

export type Comment = Awaited<ReturnType<typeof fetchThreads>>["items"][number];

export type ThreadStatus = "open" | "resolved";

const root = (boardId: string) => ["boards", boardId, "comments"] as const;

export const useThreads = ({
  boardId,
  pageId,
  status,
  share,
}: {
  boardId: string;
  pageId: string | null;
  status: ThreadStatus;
  share?: string;
}) =>
  useInfiniteQuery({
    queryKey: [...root(boardId), "threads", pageId, status],
    queryFn: ({ pageParam }) =>
      fetchThreads(boardId, {
        pageId: pageId ?? undefined,
        status,
        cursor: pageParam,
        limit: PAGE,
        share,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: POLL_MS,
  });

// Canvas pins need every open thread on the page, not just the panel's loaded pages.
export const usePins = (
  boardId: string,
  pageId: string | null,
  share?: string
) =>
  useQuery({
    queryKey: [...root(boardId), "pins", pageId],
    queryFn: async () => {
      const page = await fetchThreads(boardId, {
        pageId: pageId ?? undefined,
        status: "open",
        limit: 100,
        share,
      });
      return page.items;
    },
    enabled: pageId !== null,
    refetchInterval: POLL_MS,
  });

export const useReplies = (
  boardId: string,
  threadId: string,
  enabled: boolean,
  share?: string
) =>
  useInfiniteQuery({
    queryKey: [...root(boardId), "replies", threadId],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.api
          .boards({ id: boardId })
          .comments({ commentId: threadId })
          .replies.get({
            query: { cursor: pageParam, limit: PAGE, share },
          })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: POLL_MS,
  });

export const useCommentMutations = (boardId: string, share?: string) => {
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: root(boardId) });
  const query = { share };
  const board = () => api.api.boards({ id: boardId });
  const one = (commentId: string) => board().comments({ commentId });

  return {
    create: useMutation({
      mutationFn: async (input: {
        pageId: string;
        x: number;
        y: number;
        body: string;
        assigneeId?: string;
      }) => unwrap(await board().comments.post(input, { query })),
      onSuccess,
    }),
    reply: useMutation({
      mutationFn: async (input: { threadId: string; body: string }) =>
        unwrap(
          await one(input.threadId).replies.post(
            { body: input.body },
            { query }
          )
        ),
      onSuccess,
    }),
    edit: useMutation({
      mutationFn: async (input: { id: string; body: string }) =>
        unwrap(await one(input.id).patch({ body: input.body }, { query })),
      onSuccess,
    }),
    setResolved: useMutation({
      mutationFn: async (input: { id: string; resolved: boolean }) => {
        const { resolve, reopen } = one(input.id);
        return unwrap(
          await (input.resolved ? resolve : reopen).post(undefined, { query })
        );
      },
      onSuccess,
    }),
    assign: useMutation({
      mutationFn: async (input: { id: string; assigneeId: string | null }) =>
        unwrap(
          await one(input.id).assignee.put(
            { assigneeId: input.assigneeId },
            { query }
          )
        ),
      onSuccess,
    }),
    react: useMutation({
      mutationFn: async (input: {
        id: string;
        emoji: string;
        mine: boolean;
      }) => {
        const reaction = one(input.id).reactions({
          emoji: input.emoji,
        });
        return unwrap(
          await (input.mine ? reaction.delete : reaction.put)(undefined, {
            query,
          })
        );
      },
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: string) =>
        unwrap(await one(id).delete(undefined, { query })),
      onSuccess,
    }),
  };
};
