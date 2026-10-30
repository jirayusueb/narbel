import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";
import { authClient } from "@/shared/lib";

export const userKeys = { me: ["me"] as const };

export const useMe = () => {
  const { data: session } = authClient.useSession();
  return useQuery({
    queryKey: userKeys.me,
    queryFn: async () => unwrap(await api.api.me.get()),
    staleTime: 60_000,
    enabled: Boolean(session),
  });
};
