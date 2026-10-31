import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { boardKeys } from "@/entities/board";
import { api, retryWhileInProgress, unwrap } from "@/shared/api";

const randomKey = () =>
  // getRandomValues, not randomUUID: plain-http IP:port deploys are not a secure context
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");

export const useDuplicateBoard = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    // the key is part of the variables, so TanStack's retries of one click replay instead of copying again
    mutationFn: async ({ id, key }: { id: string; key: string }) =>
      unwrap(
        await api.api.boards({ id }).duplicate.post(undefined, {
          headers: { "idempotency-key": key },
        })
      ),
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: boardKeys.all });
      toast.success(`Created "${board.title}"`);
    },
    onError: (error) => toast.error(`Could not duplicate: ${error.message}`),
    ...retryWhileInProgress,
  });
  return {
    isPending: mutation.isPending,
    duplicate: (id: string) => mutation.mutate({ id, key: randomKey() }),
  };
};
