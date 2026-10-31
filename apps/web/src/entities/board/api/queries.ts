import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, retryWhileInProgress, unwrap } from "@/shared/api";

import type { BoardAccess, BoardSearchResult } from "../model/types";

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

export const useSearchBoards = (q: string) =>
  useQuery({
    queryKey: boardKeys.search(q),
    queryFn: async (): Promise<BoardSearchResult[]> =>
      unwrap(await api.api.boards.search.get({ query: { q } })),
    staleTime: 10_000,
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

export const useRenameBoard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      unwrap(await api.api.boards({ id }).patch({ title })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
  });
};

const useTrashTransition = (run: (id: string) => Promise<unknown>) => {
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

export const useRestoreBoard = () =>
  useTrashTransition(async (id) =>
    unwrap(await api.api.boards({ id }).restore.post())
  );

export const usePurgeBoard = () =>
  useTrashTransition(async (id) =>
    unwrap(await api.api.boards.trash({ id }).delete())
  );

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

interface AccessPatch {
  visibility?: "private" | "link" | "password";
  password?: string | null;
  shareTokenEnabled?: boolean;
  shareRole?: "editor" | "viewer";
  shareExpiresAt?: string | null;
}

const useAccessMutation = <V>(
  id: string,
  run: (variables: V) => Promise<unknown>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    // An invite whose email failed still created the access row, so errors refresh too.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: boardKeys.access(id) }),
  });
};

export const usePatchAccess = (id: string) =>
  useAccessMutation(id, async (patch: AccessPatch) =>
    unwrap(await api.api.boards({ id }).access.patch(patch))
  );

export const useInviteMember = (id: string) =>
  useAccessMutation(
    id,
    async (invite: { email: string; role: "editor" | "viewer" }) =>
      unwrap(await api.api.boards({ id }).invite.post(invite))
  );

export const useRemoveMember = (id: string) =>
  useAccessMutation(id, async (member: string) =>
    unwrap(
      await api.api
        .boards({ id })
        .access.members({ member: encodeURIComponent(member) })
        .delete()
    )
  );

export const useUnlockBoard = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (password: string) =>
      unwrap(await api.api.boards({ id }).unlock.post({ password })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["boards", id] }),
  });
};
