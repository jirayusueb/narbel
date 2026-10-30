import { Button } from "@narbel/ui/components/button";
import { Popover, PopoverTrigger } from "@narbel/ui/components/popover";
import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/entities/session";

import type { Comment } from "../api/comments";
import { REACTIONS } from "../model/types";
import type { ThreadEnv } from "../model/types";

export const ReactionBar = ({
  comment,
  env,
}: {
  comment: Comment;
  env: ThreadEnv;
}) => {
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const [picking, setPicking] = useState(false);
  const { react } = env.mutations;
  const toggle = (emoji: string, mine: boolean) =>
    react.mutate(
      { id: comment.id, emoji, mine },
      { onError: (error) => toast.error(error.message) }
    );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {comment.reactions.map(({ emoji, count, mine }) => (
        <Button
          key={emoji}
          variant="ghost"
          size="xs"
          aria-pressed={mine}
          aria-label={`${emoji} ${count}${mine ? ", you reacted" : ""}`}
          isPending={react.isPending}
          isDisabled={!signedIn}
          className="bg-muted aria-pressed:bg-citrus aria-pressed:text-citrus-foreground h-6 gap-1 rounded-full px-2 tabular-nums"
          onPress={() => toggle(emoji, mine)}
        >
          <span aria-hidden="true">{emoji}</span>
          {count}
        </Button>
      ))}
      {signedIn ? (
        <PopoverTrigger isOpen={picking} onOpenChange={setPicking}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Add reaction"
            className="size-6 rounded-full"
          >
            <SmilePlus />
          </Button>
          <Popover
            aria-label="Choose a reaction"
            placement="bottom start"
            className="w-auto flex-row gap-0.5 rounded-lg p-1.5"
          >
            {REACTIONS.map(({ emoji, label }) => {
              const mine =
                comment.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
              return (
                <Button
                  key={emoji}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={label}
                  aria-pressed={mine}
                  className="text-base"
                  onPress={() => {
                    setPicking(false);
                    toggle(emoji, mine);
                  }}
                >
                  {emoji}
                </Button>
              );
            })}
          </Popover>
        </PopoverTrigger>
      ) : null}
    </div>
  );
};
