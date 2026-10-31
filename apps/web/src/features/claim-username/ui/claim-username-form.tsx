import { Button } from "@narbel/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@narbel/ui/components/input-group";
import { Spinner } from "@narbel/ui/components/spinner";
import { useDebounce } from "@reactuses/core";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { UserAvatar, useMe } from "@/entities/person";

import { useClaimUsername, useUsernameAvailable } from "../api/username";
import {
  USERNAME_PATTERN,
  normalizeUsername,
  usernameStatus,
} from "../model/username";

const TONE = {
  muted: "text-muted-foreground",
  pending: "text-muted-foreground",
  error: "text-destructive",
  ok: "text-foreground",
} as const;

export const ClaimUsernameForm = ({ redirectTo }: { redirectTo?: string }) => {
  const router = useRouter();
  const { data: me } = useMe();
  const [username, setUsername] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const claim = useClaimUsername();

  const valid = USERNAME_PATTERN.test(username);
  const settled = useDebounce(username, 300);
  const check = useUsernameAvailable(settled, valid && settled === username);
  const available =
    valid && settled === username ? check.data?.available : undefined;

  const status = usernameStatus({ username, valid, available, serverError });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!(valid && available) || claim.isPending) {
      return;
    }
    claim.mutate(username, {
      onSuccess: () => router.history.push(redirectTo ?? "/dashboard"),
      onError: (error) => setServerError(error.message),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-card shadow-surface mx-auto flex w-full max-w-md flex-col gap-8 rounded-xl p-6 sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline leading-tight font-normal">
          Pick your username
        </h1>
        <p className="text-muted-foreground text-sm">
          Teammates and agents mention you with it, so choose one you are happy
          to keep. You can&apos;t change it later.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <UserAvatar
          size={56}
          user={{
            id: me?.id ?? "",
            name: me?.name ?? "",
            username: valid ? username : null,
            avatarUrl: null,
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <InputGroup>
            <InputGroupAddon>@</InputGroupAddon>
            <InputGroupInput
              autoFocus
              aria-label="Username"
              aria-describedby="username-status"
              aria-invalid={status.tone === "error"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              placeholder="ada_lovelace"
              value={username}
              onChange={(e) => {
                setServerError(null);
                setUsername(normalizeUsername(e.target.value));
              }}
            />
          </InputGroup>
          <p
            id="username-status"
            aria-live="polite"
            className={`text-[13px] ${TONE[status.tone]}`}
          >
            {status.text}
          </p>
        </div>
      </div>
      <Button
        type="submit"
        variant="citrus"
        isDisabled={!(valid && available) || claim.isPending}
      >
        {claim.isPending ? <Spinner /> : null}
        {valid ? `Claim @${username}` : "Claim username"}
      </Button>
    </form>
  );
};
