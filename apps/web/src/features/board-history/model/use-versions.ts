import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

const versionKeys = {
  list: (boardId: string) => ["boards", boardId, "versions"] as const,
  one: (boardId: string, versionId: string) =>
    ["boards", boardId, "versions", versionId] as const,
};

export const useVersions = (boardId: string, share?: string) =>
  useQuery({
    queryKey: versionKeys.list(boardId),
    queryFn: async () =>
      unwrap(
        await api.api.boards({ id: boardId }).versions.get({ query: { share } })
      ),
  });

export const useVersion = (
  boardId: string,
  versionId: string | null,
  share?: string
) =>
  useQuery({
    queryKey: versionKeys.one(boardId, versionId ?? ""),
    queryFn: async () =>
      unwrap(
        await api.api
          .boards({ id: boardId })
          .versions({ versionId: versionId ?? "" })
          .get({ query: { share } })
      ),
    enabled: versionId !== null,
    // a saved version never changes
    staleTime: Number.POSITIVE_INFINITY,
  });

export const useRestoreVersion = (boardId: string, share?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      unwrap(
        await api.api
          .boards({ id: boardId })
          .versions({ versionId })
          .restore.post(undefined, { query: { share } })
      ),
    // the restore itself arrives through the live connection; only the list gains a recovery point
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: versionKeys.list(boardId) }),
  });
};
