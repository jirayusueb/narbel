import { Button } from "@narbel/ui/components/button";
import { Input } from "@narbel/ui/components/input";
import { Spinner } from "@narbel/ui/components/spinner";
import { Lock } from "lucide-react";
import { useRef, useState } from "react";

import { useUnlockBoard } from "@/entities/board";
import { ApiError } from "@/shared/api";

// The server answers both a wrong password and a lockout with 403; only the message tells them apart.
const unlockMessage = (error: Error) => {
  if (error instanceof ApiError && error.status === 403) {
    return /too many/iu.test(error.message)
      ? "Too many attempts. Wait a minute, then try again."
      : "That password is not right. Try again.";
  }
  return `${error.message}. Check your connection and try again.`;
};

export const UnlockBoardForm = ({ boardId }: { boardId: string }) => {
  const [password, setPassword] = useState("");
  const unlock = useUnlockBoard(boardId);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="bg-card shadow-surface flex w-full max-w-sm flex-col items-center gap-6 rounded-xl p-8 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-lg">
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
            setError(null);
            unlock.mutate(password, {
              onError: (unlockError) => {
                setError(unlockMessage(unlockError));
                input.current?.focus();
                input.current?.select();
              },
            });
          }}
        >
          <Input
            type="password"
            ref={input}
            autoFocus
            aria-label="Board password"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "unlock-error" : undefined}
            className="w-full"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <p
            id="unlock-error"
            role="alert"
            className="text-destructive min-h-0 text-left text-[13px] empty:hidden"
          >
            {error}
          </p>
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
