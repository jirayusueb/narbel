import { Button } from "@narbel/ui/components/button";
import {
  Drawer,
  SheetBody,
  SheetHeader,
  SheetTitle,
} from "@narbel/ui/components/sheet";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquarePlus, Pencil, Share2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import type { Board } from "@/entities/board";
import type { CollabStatus } from "@/features/board-collab";
import { PagesList } from "@/features/board-pages";
import { PreferencesToggles } from "@/features/board-preferences";
import { PresenceBar } from "@/features/board-presence";
import { openRenameBoardDialog } from "@/features/rename-board";
import { openShareBoardDialog } from "@/features/share-board";
import { UserMenu } from "@/features/user-menu";

import { BoardStatus } from "./board-identity";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-2 py-3">
    <h3 className="text-subtle-foreground px-3 text-xs font-medium">{title}</h3>
    {children}
  </section>
);

const ROW =
  "h-11 w-full justify-start rounded-[12px] px-3 font-normal aria-pressed:bg-citrus aria-pressed:text-citrus-foreground";

// Phones get every board action in one bottom drawer instead of floating islands.
export const BoardDrawer = ({
  isOpen,
  onOpenChange,
  board,
  status,
  presence,
  pages,
  preferences,
  commentMode,
  onCommentModeChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  board: Board;
  status: CollabStatus;
  presence: ComponentProps<typeof PresenceBar>;
  pages: ComponentProps<typeof PagesList>;
  preferences: ComponentProps<typeof PreferencesToggles>;
  commentMode: boolean;
  onCommentModeChange: (next: boolean) => void;
}) => {
  const navigate = useNavigate();
  const isOwner = board.role === "owner";
  // Dialogs open after the drawer has started closing so focus lands in the dialog.
  const thenClose = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} aria-label="Board">
      <SheetHeader className="gap-2 px-5 pt-3 pr-5">
        <SheetTitle className="text-feature truncate">{board.title}</SheetTitle>
        <div className="flex items-center justify-between gap-3">
          <BoardStatus status={status} canWrite={board.canWrite} />
          <PresenceBar {...presence} />
        </div>
      </SheetHeader>
      <SheetBody className="divide-border divide-y px-2 pb-4">
        <Section title="Pages">
          <PagesList {...pages} />
        </Section>
        <Section title="Board">
          <div className="flex flex-col gap-0.5">
            {board.canWrite ? (
              <Button
                variant="ghost"
                className={ROW}
                aria-pressed={commentMode}
                onPress={thenClose(() => onCommentModeChange(!commentMode))}
              >
                <MessageSquarePlus data-icon="inline-start" />
                {commentMode ? "Stop commenting" : "Add a comment"}
              </Button>
            ) : null}
            {isOwner ? (
              <>
                <Button
                  variant="ghost"
                  className={ROW}
                  onPress={thenClose(() => openShareBoardDialog(board))}
                >
                  <Share2 data-icon="inline-start" />
                  Share
                </Button>
                <Button
                  variant="ghost"
                  className={ROW}
                  onPress={thenClose(() => openRenameBoardDialog(board))}
                >
                  <Pencil data-icon="inline-start" />
                  Rename board
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              className={ROW}
              onPress={thenClose(() => navigate({ to: "/dashboard" }))}
            >
              <ArrowLeft data-icon="inline-start" />
              All boards
            </Button>
          </div>
        </Section>
        <Section title="Preferences">
          <PreferencesToggles {...preferences} />
        </Section>
        <div className="flex justify-end px-1 pt-4">
          <UserMenu />
        </div>
      </SheetBody>
    </Drawer>
  );
};
