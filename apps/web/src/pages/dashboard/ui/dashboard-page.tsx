import { Skeleton } from "@narbel/ui/components/skeleton";

import { BoardCard, useBoards, useSharedBoards } from "@/entities/board";
import { CreateBoardDialog } from "@/features/create-board";
import { DeleteBoardDialog } from "@/features/delete-board";
import { McpKeysPanel } from "@/features/mcp-keys";
import { RenameBoardDialog } from "@/features/rename-board";

const GRID = "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3";

export const DashboardPage = () => {
  const { data: boards, isPending, error } = useBoards();
  const { data: shared } = useSharedBoards();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pt-10 pb-24 md:px-[30px] md:pt-16">
        <section className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-title leading-none font-normal md:text-[56px]">
                Boards
              </h1>
              {boards ? (
                <p className="text-muted-foreground text-sm">
                  {boards.length === 1 ? "1 board" : `${boards.length} boards`}
                </p>
              ) : null}
            </div>
            {boards?.length ? <CreateBoardDialog /> : null}
          </div>
          {isPending ? (
            <div className={GRID}>
              <Skeleton className="h-36 rounded-[20px]" />
              <Skeleton className="h-36 rounded-[20px]" />
              <Skeleton className="hidden h-36 rounded-[20px] lg:block" />
            </div>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm">{error.message}</p>
          ) : null}
          {boards?.length === 0 ? (
            <div className="bg-card shadow-surface flex flex-col items-start gap-6 rounded-[20px] p-8 md:p-12">
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-headline leading-tight font-normal">
                  Draw your first board
                </h2>
                <p className="text-muted-foreground max-w-prose text-sm">
                  Create a board to start sketching, and invite people or agents
                  to work on it with you.
                </p>
              </div>
              <CreateBoardDialog />
            </div>
          ) : null}
          {boards?.length ? (
            <div className={GRID}>
              {boards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  actions={
                    <>
                      <RenameBoardDialog board={board} />
                      <DeleteBoardDialog board={board} />
                    </>
                  }
                />
              ))}
            </div>
          ) : null}
        </section>
        {shared?.length ? (
          <section className="mt-20 flex flex-col gap-6">
            <h2 className="font-display text-headline leading-tight font-normal">
              Shared with you
            </h2>
            <div className={GRID}>
              {shared.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          </section>
        ) : null}
        <div className="mt-20">
          <McpKeysPanel />
        </div>
      </div>
    </div>
  );
};
