import { Button } from "@narbel/ui/components/button";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useUnlockBoard } from "@/entities/board";

export const UnlockBoardForm = ({ boardId }: { boardId: string }) => {
  const [password, setPassword] = useState("");
  const unlock = useUnlockBoard(boardId);

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="bg-card shadow-surface flex w-full max-w-sm flex-col items-center gap-6 rounded-[20px] p-8 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-[15px]">
          <Lock aria-hidden className="size-5" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-feature leading-tight font-normal">
            This board is password protected
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter the password the owner gave you.
          </p>
        </div>
        <form
          className="flex w-full flex-col gap-3"
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
            className="w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            className="w-full"
            isDisabled={!password || unlock.isPending}
          >
            {unlock.isPending ? <Spinner data-icon="inline-start" /> : null}
            Unlock
          </Button>
        </form>
      </div>
    </div>
  );
};
