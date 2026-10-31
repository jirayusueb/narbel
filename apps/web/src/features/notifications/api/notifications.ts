import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api";

const PAGE = 20;
export const NOTIFICATIONS_KEY = ["notifications"] as const;

export const useUnreadCount = () =>
  useQuery({
    queryKey: [...NOTIFICATIONS_KEY, "badge"],
    queryFn: async () =>
      unwrap(await api.api.notifications.get({ query: { limit: 1 } }))
        .unreadCount,
  });

export const useNotificationList = (enabled: boolean) =>
  useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_KEY, "list"],
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
};
