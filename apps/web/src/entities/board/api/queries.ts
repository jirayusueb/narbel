import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

export const boardKeys = {
  all: ["boards"] as const,
  detail: (id: string) => ["boards", id] as const,
};

export const useBoards = () =>
  useQuery({
    queryKey: boardKeys.all,
    queryFn: async () => unwrap(await api.api.boards.get()),
  });

export const useBoard = (id: string) =>
  useQuery({
    queryKey: boardKeys.detail(id),
    queryFn: async () => unwrap(await api.api.boards({ id }).get()),
  });

export const useCreateBoard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) =>
      unwrap(await api.api.boards.post({ title })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
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

export const useDeleteBoard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await api.api.boards({ id }).delete());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
  });
};
