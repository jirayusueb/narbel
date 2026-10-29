import { Button } from "@narbel/ui/components/button";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { BoardCard, useBoards, useSharedBoards } from "@/entities/board";
import type { Board } from "@/entities/board";
import { openCreateBoardDialog } from "@/features/create-board";
import { openDeleteBoardDialog } from "@/features/delete-board";
import { McpKeysPanel } from "@/features/mcp-keys";
import { openRenameBoardDialog } from "@/features/rename-board";

const GRID = "grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3";
const ARRIVE = [0.16, 1, 0.3, 1] as const;
const STAGGER_ITEMS = 6;
const STAGGER_S = 0.04;

const NewBoardButton = () => (
  <Button onPress={openCreateBoardDialog}>
    <Plus data-icon="inline-start" />
    New board
  </Button>
);

const BoardGrid = ({
  boards,
  editable = false,
}: {
  boards: Board[];
  editable?: boolean;
}) => {
  const reduce = useReducedMotion();
  return (
    <div className={boards.length ? GRID : "contents"}>
      {/* initial={false}: items present on first paint stay visible; only later additions animate. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {boards.map((board, index) => (
          <motion.div
            key={board.id}
            layout={!reduce}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition: {
                duration: 0.35,
                ease: ARRIVE,
                delay: Math.min(index, STAGGER_ITEMS) * STAGGER_S,
              },
            }}
            exit={{
              opacity: 0,
              scale: reduce ? 1 : 0.96,
              transition: { duration: 0.2, ease: ARRIVE },
            }}
            transition={{ layout: { duration: 0.35, ease: ARRIVE } }}
          >
            <BoardCard
              board={board}
              actions={
                editable ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Rename ${board.title}`}
                      onPress={() => openRenameBoardDialog(board)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${board.title}`}
                      onPress={() => openDeleteBoardDialog(board)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                ) : undefined
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

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
            {boards?.length ? <NewBoardButton /> : null}
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
              <NewBoardButton />
            </div>
          ) : null}
          {/* Always mounted so boards arriving after the skeleton still animate in. */}
          <BoardGrid boards={boards ?? []} editable />
        </section>
        {shared?.length ? (
          <section className="mt-20 flex flex-col gap-6">
            <h2 className="font-display text-headline leading-tight font-normal">
              Shared with you
            </h2>
            <BoardGrid boards={shared} />
          </section>
        ) : null}
        <div className="mt-20">
          <McpKeysPanel />
        </div>
      </div>
    </div>
  );
};
