import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { ThreadStatus } from "../api/comments";

// A deep link or pin can name a thread that is not loaded: page through, then widen the scope.
export const useFocusSearch = ({
  threads,
  found,
  focusedId,
  allPages,
  status,
  setAllPages,
  setStatus,
}: {
  threads: Pick<
    UseInfiniteQueryResult,
    "isFetching" | "isSuccess" | "hasNextPage" | "fetchNextPage"
  >;
  found: boolean;
  focusedId: string | null;
  allPages: boolean;
  status: ThreadStatus;
  setAllPages: (next: boolean) => void;
  setStatus: (next: ThreadStatus) => void;
}) => {
  const { isFetching, isSuccess, hasNextPage, fetchNextPage } = threads;
  const scrolledTo = useRef<string | null>(null);

  const lost =
    focusedId !== null && isSuccess && !isFetching && !found && !hasNextPage;
  if (lost && !allPages) {
    setAllPages(true);
  } else if (lost && status === "open") {
    setStatus("resolved");
  }

  useEffect(() => {
    if (focusedId === null) {
      scrolledTo.current = null;
    } else if (!isFetching && !found && hasNextPage) {
      fetchNextPage();
    } else if (found && scrolledTo.current !== focusedId) {
      scrolledTo.current = focusedId;
      document
        .querySelector(`#thread-${focusedId}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedId, found, isFetching, hasNextPage, fetchNextPage]);
};
