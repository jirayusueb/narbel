import { useMutation, useQueryClient } from "@tanstack/react-query";

import { boardKeys } from "@/entities/board";
import { api, unwrap } from "@/shared/api";

export const useRenameBoard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      unwrap(await api.api.boards({ id }).patch({ title })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.all }),
  });
};
