import { Button } from "@narbel/ui/components/button";
import { Popover, PopoverTrigger } from "@narbel/ui/components/popover";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";

import { UserAvatar } from "@/entities/user";
import { timeAgo, useLoadMore } from "@/shared/lib";

import {
  useMarkRead,
  useNotificationList,
  useNotificationStream,
  useUnreadCount,
} from "../api/notifications";
import { describe, target } from "../model/describe";

export const NotificationsBell = () => {
  useNotificationStream();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: unread = 0 } = useUnreadCount();
  const list = useNotificationList(open);
  const markRead = useMarkRead();
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const sentinel = useLoadMore(
    () => list.fetchNextPage(),
    open && !!list.hasNextPage && !list.isFetchingNextPage
  );

  return (
    <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="relative"
      >
        <Bell />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      <Popover
        aria-label="Notifications"
        placement="bottom end"
        className="w-[min(24rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <div className="flex h-12 items-center justify-between pr-2 pl-4">
          <h2 className="text-sm font-medium">Notifications</h2>
          <Button
            variant="ghost"
            size="xs"
            isDisabled={unread === 0 || markRead.isPending}
            onPress={() => markRead.mutate({})}
          >
            Mark all read
          </Button>
        </div>
        <ul className="border-border max-h-[26rem] overflow-y-auto border-t p-1.5">
          {list.isPending ? (
            <li className="flex flex-col gap-2 p-2">
              <Skeleton className="h-12 w-full rounded-[10px]" />
              <Skeleton className="h-12 w-full rounded-[10px]" />
            </li>
          ) : null}
          {list.isSuccess && items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-8 text-center text-sm">
              Nothing yet. Mentions, assignments and replies land here.
            </li>
          ) : null}
          {items.map((item) => {
            const { verb, detail } = describe(item);
            const unreadItem = !item.readAt;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="hover:bg-accent focus-visible:outline-ring flex w-full cursor-pointer items-start gap-3 rounded-[10px] p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-solid"
                  onClick={() => {
                    if (unreadItem) {
                      markRead.mutate({ ids: [item.id] });
                    }
                    const { boardId, comment } = target(item);
                    setOpen(false);
                    navigate({
                      to: "/boards/$boardId",
                      params: { boardId },
                      search: { comment },
                    });
                  }}
                >
                  <UserAvatar
                    size={32}
                    user={{
                      id: item.actor.userId,
                      name: item.actor.name,
                      username: item.actor.username,
                    }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] leading-snug">
                      <span className="font-medium">{item.actor.name}</span>{" "}
                      {verb}
                    </span>
                    {detail ? (
                      <span className="text-muted-foreground line-clamp-2 text-[13px]">
                        {detail}
                      </span>
                    ) : null}
                    <span className="text-subtle-foreground text-xs">
                      {unreadItem ? (
                        <span className="sr-only">Unread. </span>
                      ) : null}
                      {timeAgo(item.createdAt)}
                    </span>
                  </span>
                  {unreadItem ? (
                    <span
                      aria-hidden="true"
                      className="bg-foreground mt-1.5 size-2 shrink-0 rounded-full"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
          <li ref={sentinel as never} aria-hidden="true" className="h-px" />
        </ul>
      </Popover>
    </PopoverTrigger>
  );
};
