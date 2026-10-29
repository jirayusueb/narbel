import { Button } from "@narbel/ui/components/button";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Check, ChevronDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";

import { UserAvatar, handle } from "@/entities/user";
import { timeAgo } from "@/shared/lib";

import { useReplies } from "../api/comments";
import type { Comment } from "../api/comments";
import type { ThreadEnv } from "../model/types";
import { AssignPicker } from "./assign-picker";
import { CommentBody, CommentComposer } from "./comment-editor";
import { ReactionBar } from "./reaction-bar";

const onError = (error: Error) => toast.error(error.message);

const Meta = ({ comment }: { comment: Comment }) => (
  <span className="text-subtle-foreground flex items-baseline gap-1.5 text-xs">
    <time dateTime={comment.createdAt}>{timeAgo(comment.createdAt)}</time>
    {comment.editedAt ? <span>· edited</span> : null}
  </span>
);

const CommentRow = ({ comment, env }: { comment: Comment; env: ThreadEnv }) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const own = comment.author.id === env.userId;
  const { edit, remove } = env.mutations;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <UserAvatar size={24} user={comment.author} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {comment.author.name}
          <span className="text-muted-foreground font-normal">
            {comment.author.username ? ` @${comment.author.username}` : ""}
          </span>
        </span>
        <Meta comment={comment} />
        {own && env.canWrite && !editing ? (
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
        {(own || env.isOwner) && !editing ? (
          <Button
            variant={confirming ? "destructive" : "ghost"}
            size="icon-xs"
            aria-label={confirming ? "Confirm delete" : "Delete comment"}
            isDisabled={remove.isPending}
            className={confirming ? "h-6 w-auto px-2" : "size-6"}
            onBlur={() => setConfirming(false)}
            onPress={() =>
              confirming
                ? remove.mutate(comment.id, { onError })
                : setConfirming(true)
            }
          >
            {confirming ? "Delete?" : <Trash2 />}
          </Button>
        ) : null}
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

  return (
    <div className="flex flex-col gap-3">
      {replies.isPending && thread.replyCount > 0 ? (
        <Skeleton className="h-14 w-full rounded-[10px]" />
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
          isDisabled={replies.isFetchingNextPage}
          onPress={() => replies.fetchNextPage()}
        >
          Load more replies
        </Button>
      ) : null}
      {env.canWrite ? (
        <CommentComposer
          compact
          autoFocus={false}
          members={env.members}
          placeholder="Reply"
          submitLabel="Reply"
          disabled={reply.isPending}
          onSubmit={(body) =>
            reply.mutate({ threadId: thread.id, body }, { onError })
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
      className={`flex flex-col gap-2.5 rounded-[15px] p-3 transition-colors ${expanded ? "bg-muted" : "hover:bg-accent"}`}
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
            className="text-muted-foreground hover:text-foreground focus-visible:outline-ring -mt-1.5 -mr-1.5 -mb-1.5 flex min-h-6 min-w-6 cursor-pointer items-center justify-center gap-1 self-end rounded-[8px] px-1.5 text-xs focus-visible:outline-2 focus-visible:outline-solid"
          >
            {pageName ? <span>{pageName}</span> : null}
            <ChevronDown className="size-3.5 rotate-180" />
          </button>
          <CommentRow comment={thread} env={env} />
          <ReactionBar comment={thread} env={env} />
          <Replies thread={thread} env={env} />
          <div className="flex flex-wrap items-center gap-1.5">
            {env.canWrite ? <AssignPicker comment={thread} env={env} /> : null}
            {env.canWrite ? (
              <Button
                variant="secondary"
                size="xs"
                isDisabled={setResolved.isPending}
                onPress={() =>
                  setResolved.mutate(
                    { id: thread.id, resolved: !resolved },
                    { onError }
                  )
                }
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
            className="focus-visible:outline-ring flex cursor-pointer items-center gap-2 rounded-[8px] text-left focus-visible:outline-2 focus-visible:outline-solid"
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
