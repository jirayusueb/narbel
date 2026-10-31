import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, retryWhileInProgress, unwrap } from "@/shared/api";

import type { BoardAccess } from "../model/types";

export const boardKeys = {
  all: ["boards"] as const,
  shared: ["boards", "shared"] as const,
  detail: (id: string, share?: string) =>
    ["boards", id, share ?? null] as const,
  access: (id: string) => ["boards", id, "access"] as const,
  search: (q: string) => ["boards", "search", q] as const,
  trash: ["boards", "trash"] as const,
  members: (id: string) => ["boards", id, "members"] as const,
};

export const useBoards = () =>
  useQuery({
    queryKey: boardKeys.all,
    queryFn: async () => unwrap(await api.api.boards.get()),
  });

export const useSharedBoards = () =>
  useQuery({
    queryKey: boardKeys.shared,
    queryFn: async () => unwrap(await api.api["shared-boards"].get()),
  });

export const useBoard = (id: string, share?: string) =>
  useQuery({
    queryKey: boardKeys.detail(id, share),
    queryFn: async () =>
      unwrap(await api.api.boards({ id }).get({ query: { share } })),
    retry: false,
  });

export const useBoardMembers = (id: string, share?: string, enabled = true) =>
  useQuery({
    queryKey: boardKeys.members(id),
    queryFn: async () =>
      unwrap(await api.api.boards({ id }).members.get({ query: { share } })),
    staleTime: 30_000,
    enabled,
  });

export const useTrashedBoards = () =>
  useQuery({
    queryKey: boardKeys.trash,
    queryFn: async () => unwrap(await api.api.boards.trash.get()),
  });

export const useBoardAccess = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: boardKeys.access(id),
    queryFn: async (): Promise<BoardAccess> =>
      unwrap(await api.api.boards({ id }).access.get()),
    enabled,
  });

// Shared by create-board and import-board, so it lives here instead of in one feature.
export const useCreateBoard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, key }: { title: string; key: string }) =>
      unwrap(
        await api.api.boards.post(
          { title },
          { headers: { "idempotency-key": key } }
        )
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
    ...retryWhileInProgress,
  });
};

// Trash, restore and purge move a board between lists and hide its notifications;
// trash-board and import-board both run them, so the transition stays here.
export const useTrashTransition = (run: (id: string) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]),
  });
};

export const useTrashBoard = () =>
  useTrashTransition(async (id) =>
    unwrap(await api.api.boards({ id }).delete())
  );

export const usePurgeBoard = () =>
  useTrashTransition(async (id) =>
    unwrap(await api.api.boards.trash({ id }).delete())
  );
