import { Button } from "@narbel/ui/components/button";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Check, ChevronDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";

import { UserAvatar, handle } from "@/entities/user";
import { timeAgo, useDraftKey } from "@/shared/lib";

import { useReplies } from "../api/comments";
import type { Comment } from "../api/comments";
import type { ThreadEnv } from "../model/types";
import { AssignPicker } from "./assign-picker";
import { CommentBody, CommentComposer } from "./comment-editor";
import { ReactionBar } from "./reaction-bar";

const onError = (error: Error) => toast.error(error.message);

const Meta = ({ comment }: { comment: Comment }) => (
  <span className="text-muted-foreground flex items-baseline gap-1.5 text-xs">
    <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
    {comment.editedAt ? <span>· edited</span> : null}
  </span>
);

// Where focus goes when the control that held it disappears: the neighbouring thread's header, else the panel itself.
const nextThreadFocus = (from: Element) => {
  const item = from.closest("li");
  const sibling = item?.nextElementSibling ?? item?.previousElementSibling;
  return (
    sibling?.querySelector<HTMLElement>("article button[aria-expanded]") ??
    from.closest<HTMLElement>("[data-comments-panel]")
  );
};

const CommentRow = ({
  comment,
  env,
  root = false,
  onGone,
}: {
  comment: Comment;
  env: ThreadEnv;
  root?: boolean;
  // Clears the selection of a thread that is about to disappear.
  onGone?: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);
  const own = comment.author.id === env.userId;
  const { edit, remove } = env.mutations;

  // Leaving edit mode unmounts the composer; focus returns to the Edit button.
  useEffect(() => {
    if (wasEditing.current && !editing) {
      row.current
        ?.querySelector<HTMLElement>('[aria-label="Edit comment"]')
        ?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);
  const canEdit = own && env.canWrite && !editing;
  const canDelete = (own || env.isOwner) && !editing;
  const hasActions = canEdit || canDelete;

  return (
    <div ref={row} className="group/row flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <UserAvatar size={24} user={comment.author} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {comment.author.name}
          <span className="text-muted-foreground font-normal">
            {comment.author.username ? ` @${comment.author.username}` : ""}
          </span>
        </span>
        {/* With a mouse, edit and delete take the timestamp's place on hover or focus, so long names keep their room;
            touch shows both side by side. Opacity, not display, keeps them reachable with Tab. */}
        <span className="relative flex shrink-0 items-center gap-0.5">
          <span
            className={
              hasActions
                ? "transition-opacity pointer-fine:group-focus-within/row:opacity-0 pointer-fine:group-hover/row:opacity-0"
                : undefined
            }
          >
            <Meta comment={comment} />
          </span>
          {hasActions ? (
            <span className="flex items-center gap-0.5 transition-opacity pointer-fine:absolute pointer-fine:inset-y-0 pointer-fine:right-0 pointer-fine:opacity-0 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-hover/row:opacity-100">
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Edit comment"
                  className="size-6"
                  onPress={() => setEditing(true)}
                >
                  <Pencil />
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant={confirming ? "destructive" : "ghost"}
                  size="icon-xs"
                  aria-label={confirming ? "Confirm delete" : "Delete comment"}
                  isPending={remove.isPending}
                  className={confirming ? "h-6 w-auto px-2" : "size-6"}
                  onBlur={() => setConfirming(false)}
                  onPress={(e) => {
                    if (!confirming) {
                      setConfirming(true);
                      return;
                    }
                    // A deleted thread hands focus to its neighbour; a deleted reply, to its thread header.
                    const target = root
                      ? nextThreadFocus(e.target as Element)
                      : (e.target as Element)
                          .closest("article")
                          ?.querySelector<HTMLElement>("button[aria-expanded]");
                    // Deselect first: a selection pointing at a gone thread makes the panel widen its scope and unmount the neighbour.
                    if (root) {
                      onGone?.();
                    }
                    remove.mutate(comment.id, {
                      onError,
                      onSuccess: () => target?.focus(),
                    });
                  }}
                >
                  {confirming ? "Delete?" : <Trash2 />}
                </Button>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
      {editing ? (
        <CommentComposer
          compact
          members={env.members}
          initial={comment.body}
          submitLabel="Save"
          disabled={edit.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) =>
            edit.mutate(
              { id: comment.id, body },
              { onError, onSuccess: () => setEditing(false) }
            )
          }
        />
      ) : (
        <CommentBody markdown={comment.body} />
      )}
    </div>
  );
};

const Replies = ({ thread, env }: { thread: Comment; env: ThreadEnv }) => {
  const replies = useReplies(env.boardId, thread.id, true, env.share);
  const items = replies.data?.pages.flatMap((page) => page.items) ?? [];
  const { reply } = env.mutations;
  const draftKey = useDraftKey();
  // Re-keying remounts an empty composer after a send; it takes focus so a second reply can follow.
  const [sent, setSent] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {replies.isPending && thread.replyCount > 0 ? (
        <Skeleton className="h-14 w-full rounded-md" />
      ) : null}
      {items.length > 0 ? (
        <ul className="border-border flex flex-col gap-4 border-t pt-3">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5">
              <CommentRow comment={item} env={env} />
              <ReactionBar comment={item} env={env} />
            </li>
          ))}
        </ul>
      ) : null}
      {replies.hasNextPage ? (
        <Button
          variant="ghost"
          size="xs"
          className="self-start"
          isPending={replies.isFetchingNextPage}
          onPress={() => replies.fetchNextPage()}
        >
          Load more replies
        </Button>
      ) : null}
      {env.canWrite ? (
        <CommentComposer
          key={sent}
          compact
          autoFocus={sent > 0}
          members={env.members}
          placeholder="Reply"
          submitLabel="Reply"
          disabled={reply.isPending}
          onSubmit={(body) =>
            reply.mutate(
              { threadId: thread.id, body, key: draftKey.get(body) },
              {
                onError,
                onSuccess: () => {
                  draftKey.rotate();
                  setSent((n) => n + 1);
                },
              }
            )
          }
        />
      ) : null}
    </div>
  );
};

export const ThreadCard = ({
  thread,
  env,
  expanded,
  showPage,
  onToggle,
}: {
  thread: Comment;
  env: ThreadEnv;
  expanded: boolean;
  showPage: boolean;
  onToggle: () => void;
}) => {
  const { setResolved } = env.mutations;
  const resolved = thread.resolvedAt !== null;
  const pageName = showPage ? env.pageName(thread.pageId) : undefined;

  // Body text and links inside the card keep their own behaviour; only plain space toggles.
  const onBodyClick = (event: MouseEvent) => {
    if (
      !(event.target as HTMLElement).closest("a, button, [contenteditable]")
    ) {
      onToggle();
    }
  };

  return (
    <article
      id={`thread-${thread.id}`}
      className={`flex flex-col gap-2.5 rounded-lg p-3 transition-colors ${expanded ? "bg-background" : "hover:bg-accent"}`}
    >
      {expanded ? (
        <>
          <button
            type="button"
            aria-expanded
            aria-label={
              pageName ? `${pageName}, collapse thread` : "Collapse thread"
            }
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground focus-visible:outline-ring -mt-1.5 -mr-1.5 -mb-1.5 flex min-h-6 min-w-6 cursor-pointer items-center justify-center gap-1 self-end rounded-sm px-1.5 text-xs focus-visible:outline-2 focus-visible:outline-solid"
          >
            {pageName ? <span>{pageName}</span> : null}
            <ChevronDown className="size-3.5 rotate-180" />
          </button>
          <CommentRow comment={thread} env={env} root onGone={onToggle} />
          <ReactionBar comment={thread} env={env} />
          <Replies thread={thread} env={env} />
          <div className="flex flex-wrap items-center gap-1.5">
            {env.canWrite ? <AssignPicker comment={thread} env={env} /> : null}
            {env.canWrite ? (
              <Button
                variant="secondary"
                size="xs"
                isPending={setResolved.isPending}
                onPress={(e) => {
                  // The thread leaves this list when its status changes; focus moves to its neighbour or the panel.
                  const target = nextThreadFocus(e.target as Element);
                  onToggle();
                  setResolved.mutate(
                    { id: thread.id, resolved: !resolved },
                    { onError, onSuccess: () => target?.focus() }
                  );
                }}
              >
                {resolved ? (
                  <RotateCcw data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                {resolved ? "Reopen" : "Resolve"}
              </Button>
            ) : null}
          </div>
          {resolved && thread.resolvedBy ? (
            <p className="text-muted-foreground text-xs">
              Resolved by {thread.resolvedBy.name}
              {thread.resolvedAt ? ` ${timeAgo(thread.resolvedAt)}` : ""}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={false}
            onClick={onToggle}
            className="focus-visible:outline-ring flex cursor-pointer items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-solid"
          >
            <UserAvatar size={24} user={thread.author} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {thread.author.name}
            </span>
            <Meta comment={thread} />
          </button>
          {/* The keyboard path is the header button above. */}
          {/* oxlint-disable-next-line click-events-have-key-events */}
          <div
            role="presentation"
            className="cursor-pointer"
            onClick={onBodyClick}
          >
            <div className="line-clamp-3">
              <CommentBody markdown={thread.body} />
            </div>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {thread.reactions.length > 0 ? (
              <span className="flex gap-1.5">
                {thread.reactions.map((r) => (
                  <span key={r.emoji} className="tabular-nums">
                    {r.emoji} {r.count}
                  </span>
                ))}
              </span>
            ) : null}
            {thread.replyCount > 0 ? (
              <span>
                {thread.replyCount === 1
                  ? "1 reply"
                  : `${thread.replyCount} replies`}
              </span>
            ) : null}
            {thread.assignee ? (
              <span className="flex items-center gap-1">
                <UserAvatar size={14} user={thread.assignee} />
                {handle(thread.assignee)}
              </span>
            ) : null}
            {pageName ? <span>{pageName}</span> : null}
          </div>
        </>
      )}
    </article>
  );
};
