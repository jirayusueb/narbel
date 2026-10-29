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
import { useCopy } from "@/shared/lib";

const selectClass =
  "h-10 rounded-[10px] border border-input bg-card px-3 text-sm outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

const Select = (props: ComponentProps<"select">) => (
  <select className={selectClass} {...props} />
);

const onError = (error: Error) => toast.error(error.message);

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  hint: string;
  Icon: LucideIcon;
}[] = [
  {
    value: "private",
    label: "Private",
    hint: "Only people you invite",
    Icon: Lock,
  },
  {
    value: "link",
    label: "Anyone with the link",
    hint: "Signed-in people with the link can view",
    Icon: Link2,
  },
  {
    value: "password",
    label: "Password",
    hint: "Signed-in people who know the password",
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
  const [choice, setChoice] = useState(access.visibility);

  return (
    <Section title="Who can open this board">
      <fieldset
        aria-label="Visibility"
        className="bg-muted m-0 flex min-w-0 flex-col gap-1 rounded-[20px] border-0 p-1.5"
      >
        {VISIBILITY_OPTIONS.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            aria-disabled={patch.isPending}
            className={`focus-visible:outline-ring flex cursor-pointer items-center gap-3 rounded-[15px] p-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-60 ${
              choice === value ? "bg-card shadow-surface" : "hover:bg-card/60"
            }`}
            onClick={() => {
              // Explicit press per choice: no save while the user is still moving between options.
              if (patch.isPending || choice === value) {
                return;
              }
              setChoice(value);
              if (value === "password" && !access.hasPassword) {
                return;
              }
              patch.mutate(
                { visibility: value },
                {
                  onError: (error) => {
                    setChoice(access.visibility);
                    onError(error);
                  },
                }
              );
            }}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${
                choice === value
                  ? "bg-citrus text-citrus-foreground"
                  : "bg-background text-muted-foreground"
              }`}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{label}</span>
              <span className="text-muted-foreground text-[13px]">{hint}</span>
            </span>
          </button>
        ))}
      </fieldset>
      {choice === "password" ? (
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
                  toast.success("Password saved");
                },
              }
            );
          }}
        >
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="Board password"
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
      <div className="flex flex-wrap items-center gap-3">
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
          Anyone with the link
        </label>
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
        <div className="bg-muted flex items-center gap-2 rounded-[15px] p-1.5 pl-3">
          <input
            readOnly
            aria-label="Share link"
            value={share.url}
            className="text-foreground min-w-0 flex-1 truncate bg-transparent font-mono text-[13px] outline-hidden"
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
              <span className="min-w-0 truncate">
                {member.name || member.email}
                <span className="text-muted-foreground"> {member.email}</span>
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
  const { data: access } = useBoardAccess(board.id, isOpen);

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
          People you share with need a Narbel account.
        </DialogDescription>
      </DialogHeader>
      {access ? (
        <div className="flex max-h-[70vh] flex-col gap-8 overflow-y-auto px-1 py-1">
          <VisibilitySection boardId={board.id} access={access} />
          <LinkSection boardId={board.id} access={access} />
          <InviteSection boardId={board.id} />
          <MembersSection boardId={board.id} access={access} />
        </div>
      ) : (
        <Skeleton className="h-40" />
      )}
    </Dialog>
  );
};

export const openShareBoardDialog = (board: Board) => {
  overlay.open((control) => <ShareBoardDialog board={board} {...control} />);
};
