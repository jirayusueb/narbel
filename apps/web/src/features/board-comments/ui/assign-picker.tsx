import { Button } from "@narbel/ui/components/button";
import { Input } from "@narbel/ui/components/input";
import { Popover, PopoverTrigger } from "@narbel/ui/components/popover";
import { UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { UserAvatar, handle } from "@/entities/person";

import type { Comment } from "../api/comments";
import type { ThreadEnv } from "../model/types";

export const AssignPicker = ({
  comment,
  env,
}: {
  comment: Comment;
  env: ThreadEnv;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { assignee } = comment;
  const needle = query.trim().toLowerCase().replace(/^@/u, "");
  const matches = env.members.filter(
    (member) =>
      member.name.toLowerCase().includes(needle) ||
      member.username?.includes(needle)
  );

  const assign = (assigneeId: string | null) => {
    setOpen(false);
    env.mutations.assign.mutate(
      { id: comment.id, assigneeId },
      { onError: (error) => toast.error(error.message) }
    );
  };

  return (
    <PopoverTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <Button
        variant="secondary"
        size="xs"
        aria-label={
          assignee ? `Assigned to ${handle(assignee)}` : "Assign thread"
        }
      >
        {assignee ? (
          <UserAvatar size={16} user={assignee} />
        ) : (
          <UserRoundPlus data-icon="inline-start" />
        )}
        {assignee ? handle(assignee) : "Assign"}
      </Button>
      <Popover
        aria-label="Assign to a member"
        placement="bottom start"
        className="w-64 gap-2 rounded-lg p-2"
      >
        <Input
          autoFocus
          aria-label="Search members"
          placeholder="Search members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul
          aria-label="Members"
          className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
        >
          {matches.map((member) => (
            <li key={member.userId}>
              <button
                type="button"
                aria-current={assignee?.id === member.userId}
                onClick={() => assign(member.userId)}
                className="hover:bg-accent focus-visible:outline-ring aria-[current=true]:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-solid"
              >
                <UserAvatar size={24} user={{ id: member.userId, ...member }} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {member.name}
                </span>
                {member.username ? (
                  <span className="text-muted-foreground truncate">
                    @{member.username}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {matches.length === 0 ? (
            <li className="text-muted-foreground px-2 py-3 text-center text-[13px]">
              No one matches.
            </li>
          ) : null}
        </ul>
        {assignee ? (
          <Button variant="ghost" size="xs" onPress={() => assign(null)}>
            Unassign
          </Button>
        ) : null}
      </Popover>
    </PopoverTrigger>
  );
};
