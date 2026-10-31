import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { userKeys } from "@/entities/person";
import { api, unwrap } from "@/shared/api";

export const useUsernameAvailable = (username: string, enabled: boolean) =>
  useQuery({
    queryKey: ["usernames", username],
    queryFn: async () =>
      unwrap(await api.api.usernames({ username }).available.get()),
    enabled,
    staleTime: 10_000,
  });

export const useClaimUsername = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) =>
      unwrap(await api.api.me.username.post({ username })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.me }),
  });
};
