import { Button } from "@narbel/ui/components/button";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@narbel/ui/components/tabs";
import { Layers, X } from "lucide-react";
import { useState } from "react";

import { useLoadMore } from "@/shared/lib";

import { useThreads } from "../api/comments";
import type { Comment, ThreadStatus } from "../api/comments";
import type { ThreadEnv } from "../model/types";
import { useFocusSearch } from "../model/use-focus-search";
import { ThreadCard } from "./thread-card";

const emptyHint = (
  status: ThreadStatus,
  canWrite: boolean,
  allPages: boolean
) => {
  if (status === "open" && canWrite) {
    return "Press C, then click the canvas or press Enter to start one.";
  }
  return allPages ? "No threads on any page." : "No threads on this page.";
};

const Empty = ({ status, hint }: { status: ThreadStatus; hint: string }) => (
  <div className="text-muted-foreground flex flex-col gap-1 px-4 py-12 text-center text-sm">
    <p className="text-foreground font-medium">
      {status === "open" ? "No open threads" : "Nothing resolved yet"}
    </p>
    <p>{hint}</p>
  </div>
);

export const CommentsPanel = ({
  env,
  pageId,
  focusedId,
  startAllPages,
  onSelect,
  onClose,
}: {
  env: ThreadEnv;
  pageId: string | null;
  focusedId: string | null;
  startAllPages: boolean;
  onSelect: (thread: Comment | null) => void;
  onClose: () => void;
}) => {
  const [status, setStatus] = useState<ThreadStatus>("open");
  const [allPages, setAllPages] = useState(startAllPages);
  const threads = useThreads({
    boardId: env.boardId,
    pageId: allPages ? null : pageId,
    status,
    share: env.share,
  });
  const items = threads.data?.pages.flatMap((page) => page.items) ?? [];
  const sentinel = useLoadMore(
    () => threads.fetchNextPage(),
    !!threads.hasNextPage && !threads.isFetchingNextPage
  );
  useFocusSearch({
    threads,
    found: focusedId !== null && items.some((t) => t.id === focusedId),
    focusedId,
    allPages,
    status,
    setAllPages,
    setStatus,
  });

  const changeStatus = (next: ThreadStatus) => {
    onSelect(null);
    setStatus(next);
  };
  const toggleScope = () => {
    onSelect(null);
    setAllPages(!allPages);
  };

  return (
    <section
      aria-label="Comments"
      className="bg-card shadow-surface flex h-full min-h-0 flex-col rounded-[20px]"
    >
      <header className="flex items-center justify-between gap-2 pt-4 pr-3 pl-5">
        <h2 className="font-display text-feature font-normal">Comments</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close comments"
          onPress={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <Tabs
          selectedKey={status}
          onSelectionChange={(key) => changeStatus(key as ThreadStatus)}
        >
          <TabsList aria-label="Thread status">
            <TabsTrigger id="open">Open</TabsTrigger>
            <TabsTrigger id="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={allPages}
          onPress={toggleScope}
        >
          <Layers data-icon="inline-start" />
          All pages
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {threads.isPending ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-20 w-full rounded-[15px]" />
            <Skeleton className="h-20 w-full rounded-[15px]" />
            <Skeleton className="h-20 w-full rounded-[15px]" />
          </div>
        ) : null}
        {threads.error ? (
          <p className="text-destructive p-3 text-sm">
            {threads.error.message}
          </p>
        ) : null}
        {threads.isSuccess && items.length === 0 ? (
          <Empty
            status={status}
            hint={emptyHint(status, env.canWrite, allPages)}
          />
        ) : null}
        <ul className="flex flex-col gap-0.5">
          {items.map((thread) => (
            <li key={thread.id}>
              <ThreadCard
                thread={thread}
                env={env}
                expanded={thread.id === focusedId}
                showPage={allPages}
                onToggle={() =>
                  onSelect(thread.id === focusedId ? null : thread)
                }
              />
            </li>
          ))}
        </ul>
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        {threads.isFetchingNextPage ? (
          <Skeleton className="m-2 h-20 rounded-[15px]" />
        ) : null}
      </div>
    </section>
  );
};
