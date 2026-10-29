import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { api, unwrap } from "@/shared/api";
import { SERVER_URL } from "@/shared/config";

const PAGE = 20;
const ROOT = ["notifications"] as const;

export const useUnreadCount = () =>
  useQuery({
    queryKey: [...ROOT, "badge"],
    queryFn: async () =>
      unwrap(await api.api.notifications.get({ query: { limit: 1 } }))
        .unreadCount,
  });

export const useNotificationList = (enabled: boolean) =>
  useInfiniteQuery({
    queryKey: [...ROOT, "list"],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.api.notifications.get({
          query: { cursor: pageParam, limit: PAGE },
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });

export const useMarkRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // No ids marks everything read.
    mutationFn: async ({ ids }: { ids?: string[] }) =>
      unwrap(await api.api.notifications.read.post({ ids })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROOT }),
  });
};

// The browser reconnects an EventSource on its own, so there is no retry logic here.
export const useNotificationStream = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`${SERVER_URL}/api/notifications/stream`, {
      withCredentials: true,
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: ROOT });
    source.addEventListener("notification", refresh);
    return () => source.close();
  }, [queryClient]);
};
