import { Button } from "@narbel/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@narbel/ui/components/empty";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { useState } from "react";
import { toast } from "sonner";

import { useUnlockBoard } from "@/entities/board";

export const UnlockBoardForm = ({ boardId }: { boardId: string }) => {
  const [password, setPassword] = useState("");
  const unlock = useUnlockBoard(boardId);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>This board is password protected</EmptyTitle>
        <EmptyDescription>
          Enter the password the owner gave you.
        </EmptyDescription>
      </EmptyHeader>
      <form
        className="flex w-full max-w-xs gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          unlock.mutate(password, {
            onError: (error) => toast.error(error.message),
          });
        }}
      >
        <Input
          type="password"
          autoFocus
          aria-label="Board password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" isDisabled={!password || unlock.isPending}>
          {unlock.isPending ? <Spinner data-icon="inline-start" /> : null}
          Unlock
        </Button>
      </form>
    </Empty>
  );
};
