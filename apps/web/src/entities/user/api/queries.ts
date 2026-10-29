import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

export const userKeys = { me: ["me"] as const };

export const useMe = () =>
  useQuery({
    queryKey: userKeys.me,
    queryFn: async () => unwrap(await api.api.me.get()),
    staleTime: 60_000,
  });
