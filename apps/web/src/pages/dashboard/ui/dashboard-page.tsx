import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@narbel/ui/components/empty";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { LayoutDashboard } from "lucide-react";

import { BoardCard, useBoards, useSharedBoards } from "@/entities/board";
import { CreateBoardDialog } from "@/features/create-board";
import { DeleteBoardDialog } from "@/features/delete-board";
import { McpKeysPanel } from "@/features/mcp-keys";
import { RenameBoardDialog } from "@/features/rename-board";

export const DashboardPage = () => {
  const { data: boards, isPending, error } = useBoards();
  const { data: shared } = useSharedBoards();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-lg font-medium">Your boards</h1>
            {boards?.length ? <CreateBoardDialog /> : null}
          </div>
          {isPending ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : null}
          {error ? <p className="text-destructive">{error.message}</p> : null}
          {boards?.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutDashboard />
                </EmptyMedia>
                <EmptyTitle>No boards yet</EmptyTitle>
                <EmptyDescription>
                  Create your first board to start drawing.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <CreateBoardDialog />
              </EmptyContent>
            </Empty>
          ) : null}
          {boards?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
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
          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-lg font-medium">
              Shared with you
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {shared.map((board) => (
                <BoardCard key={board.id} board={board} />
              ))}
            </div>
          </section>
        ) : null}
        <McpKeysPanel />
      </div>
    </div>
  );
};
