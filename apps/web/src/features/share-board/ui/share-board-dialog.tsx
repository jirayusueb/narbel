import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@narbel/ui/components/dialog";
import { Input } from "@narbel/ui/components/input";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Check, Copy, KeyRound, Link2, Lock, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { overlay } from "overlay-kit";
import { useState } from "react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import {
  useBoardAccess,
  useInviteMember,
  usePatchAccess,
  useRemoveMember,
} from "@/entities/board";
import type { Board, BoardAccess, Visibility } from "@/entities/board";
import { UserAvatar } from "@/entities/user";
import { useCopy } from "@/shared/lib";

const selectClass =
  "h-10 rounded-md border border-input bg-card px-3 text-sm outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

const Select = (props: ComponentProps<"select">) => (
  <select className={selectClass} {...props} />
);

const onError = (error: Error) => toast.error(error.message);

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  hint: string;
  confirmation: string;
  Icon: LucideIcon;
}[] = [
  {
    value: "private",
    label: "Private",
    hint: "Only people you invite",
    confirmation: "Only people you invite can open this board now",
    Icon: Lock,
  },
  {
    value: "link",
    label: "Anyone signed in",
    hint: "Signed-in people with the board’s address can view",
    confirmation: "Signed-in people with the address can now view this board",
    Icon: Link2,
  },
  {
    value: "password",
    label: "Password",
    hint: "Signed-in people who know the password",
    confirmation: "The board now asks for its password",
    Icon: KeyRound,
  },
];

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h3 className="text-sm font-medium">{title}</h3>
    {children}
  </section>
);

const VisibilitySection = ({
  boardId,
  access,
}: {
  boardId: string;
  access: BoardAccess;
}) => {
  const patch = usePatchAccess(boardId);
  const [password, setPassword] = useState("");
  // The server refuses "password" visibility without a password, so that choice waits for the form.
  // Pressed state always mirrors the saved visibility; this only opens the password form.
  const [settingPassword, setSettingPassword] = useState(false);
  const saved = access.visibility;
  const showPasswordForm = settingPassword || saved === "password";

  return (
    <Section title="Who can open this board">
      <fieldset
        aria-label="Visibility"
        className="bg-muted m-0 flex min-w-0 flex-col gap-1 rounded-xl border-0 p-1.5"
      >
        {VISIBILITY_OPTIONS.map(
          ({ value, label, hint, confirmation, Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={saved === value}
              aria-disabled={patch.isPending}
              className={`focus-visible:outline-ring flex cursor-pointer items-center gap-3 rounded-lg p-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-60 ${
                saved === value ? "bg-card shadow-surface" : "hover:bg-card/60"
              }`}
              onClick={() => {
                // Explicit press per choice: no save while the user is still moving between options.
                if (patch.isPending || saved === value) {
                  return;
                }
                if (value === "password" && !access.hasPassword) {
                  setSettingPassword(true);
                  return;
                }
                setSettingPassword(false);
                patch.mutate(
                  { visibility: value },
                  {
                    onError,
                    onSuccess: () => toast.success(confirmation),
                  }
                );
              }}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                  saved === value
                    ? "bg-citrus text-citrus-foreground"
                    : "bg-background text-muted-foreground"
                }`}
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-muted-foreground text-[13px]">
                  {hint}
                </span>
              </span>
            </button>
          )
        )}
      </fieldset>
      {showPasswordForm ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch.mutate(
              { visibility: "password", password },
              {
                onError,
                onSuccess: () => {
                  setPassword("");
                  setSettingPassword(false);
                  toast.success("Password saved. The board now asks for it");
                },
              }
            );
          }}
        >
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="Board password"
            aria-describedby={
              saved === "password" ? undefined : "password-hint"
            }
            placeholder={access.hasPassword ? "New password" : "Set a password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" isDisabled={!password || patch.isPending}>
            Save
          </Button>
          {access.hasPassword ? (
            <Button
              variant="outline"
              isDisabled={patch.isPending}
              onPress={() => patch.mutate({ password: null }, { onError })}
            >
              Clear
            </Button>
          ) : null}
        </form>
      ) : null}
      {showPasswordForm && saved !== "password" ? (
        <p id="password-hint" className="text-muted-foreground text-[13px]">
          Set a password to turn this on. Until you save, the board stays{" "}
          {VISIBILITY_OPTIONS.find((o) => o.value === saved)?.label}.
        </p>
      ) : null}
    </Section>
  );
};

const LinkSection = ({
  boardId,
  access,
}: {
  boardId: string;
  access: BoardAccess;
}) => {
  const patch = usePatchAccess(boardId);
  const { share } = access;
  const [copied, copy] = useCopy();
  const enabled = share?.enabled ?? false;

  return (
    <Section title="Share link">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={enabled}
            disabled={patch.isPending}
            onChange={(e) =>
              patch.mutate({ shareTokenEnabled: e.target.checked }, { onError })
            }
          />
          Turn on a share link
        </label>
        <span
          className={`text-sm ${enabled ? "text-muted-foreground" : "text-subtle-foreground"}`}
        >
          People who open it
        </span>
        <Select
          aria-label="Link role"
          value={share?.role ?? "viewer"}
          disabled={!enabled || patch.isPending}
          onChange={(e) =>
            patch.mutate(
              { shareRole: e.target.value as "editor" | "viewer" },
              { onError }
            )
          }
        >
          <option value="viewer">can view</option>
          <option value="editor">can edit</option>
        </Select>
      </div>
      {enabled && share ? (
        <div className="bg-muted flex items-center gap-2 rounded-lg p-1.5 pl-3">
          <input
            readOnly
            aria-label="Share link"
            value={share.url}
            className="text-foreground focus-visible:outline-ring min-w-0 flex-1 truncate rounded-xs bg-transparent font-mono text-[13px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid"
          />
          <Button
            variant="secondary"
            size="icon-sm"
            aria-label="Copy link"
            onPress={() => copy(share.url)}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : null}
    </Section>
  );
};

const InviteSection = ({ boardId }: { boardId: string }) => {
  const invite = useInviteMember(boardId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");

  return (
    <Section title="Invite by email">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate(
            { email: email.trim(), role },
            {
              onError,
              onSuccess: () => {
                setEmail("");
                toast.success("Invite sent");
              },
            }
          );
        }}
      >
        <Input
          type="email"
          required
          aria-label="Invite email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          aria-label="Invite role"
          value={role}
          onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </Select>
        <Button type="submit" isDisabled={!email.trim() || invite.isPending}>
          Invite
        </Button>
      </form>
    </Section>
  );
};

const MembersSection = ({
  boardId,
  access,
}: {
  boardId: string;
  access: BoardAccess;
}) => {
  const remove = useRemoveMember(boardId);
  return (
    <Section title="People with access">
      {access.members.length === 0 ? (
        <p className="text-muted-foreground">Only you so far.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {access.members.map((member) => (
            <li
              key={member.userId ?? member.email}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <UserAvatar
                  size={28}
                  user={{
                    id: member.userId ?? member.email,
                    name: member.name || member.email,
                    username: null,
                    avatarUrl: member.userId ? undefined : null,
                  }}
                />
                <span className="min-w-0 truncate">
                  {member.name || member.email}
                  <span className="text-muted-foreground"> {member.email}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {member.userId ? null : (
                  <span className="border-border-strong text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                    pending
                  </span>
                )}
                <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs">
                  {member.role}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.email}`}
                  isDisabled={remove.isPending}
                  onPress={() =>
                    remove.mutate(member.userId ?? member.email, { onError })
                  }
                >
                  <X />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

const ShareBoardDialog = ({
  board,
  isOpen,
  close,
  unmount,
}: {
  board: Board;
  isOpen: boolean;
  close: () => void;
  unmount: () => void;
}) => {
  const {
    data: access,
    isError,
    isFetching,
    refetch,
  } = useBoardAccess(board.id, isOpen);

  let body = <Skeleton className="h-40" />;
  if (access) {
    body = (
      <div className="flex max-h-[70vh] flex-col gap-8 overflow-y-auto px-1 py-1">
        <VisibilitySection boardId={board.id} access={access} />
        <LinkSection boardId={board.id} access={access} />
        <InviteSection boardId={board.id} />
        <MembersSection boardId={board.id} access={access} />
      </div>
    );
  } else if (isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-destructive text-sm">
          Sharing settings didn’t load. Check your connection and try again.
        </p>
        <Button
          variant="outline"
          isPending={isFetching}
          onPress={() => refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }
  return (
    <Dialog
      className="sm:max-w-lg"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      onExitComplete={unmount}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-[24px] font-normal tracking-[-0.02em]">
          Share “{board.title}”
        </DialogTitle>
        <DialogDescription>
          People you share with need a narbel account.
        </DialogDescription>
      </DialogHeader>
      {body}
    </Dialog>
  );
};

export const openShareBoardDialog = (board: Board) => {
  overlay.open((control) => <ShareBoardDialog board={board} {...control} />);
};
