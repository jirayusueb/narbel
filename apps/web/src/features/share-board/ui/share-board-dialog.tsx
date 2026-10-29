import { Badge } from "@narbel/ui/components/badge";
import { Button } from "@narbel/ui/components/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@narbel/ui/components/dialog";
import { Input } from "@narbel/ui/components/input";
import { Separator } from "@narbel/ui/components/separator";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Copy, Share2, X } from "lucide-react";
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

const selectClass =
  "h-8 rounded-none border border-input bg-transparent px-2 text-xs dark:bg-input/30";

const Select = (props: ComponentProps<"select">) => (
  <select className={selectClass} {...props} />
);

const onError = (error: Error) => toast.error(error.message);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-xs font-medium">{title}</h3>
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
      <Select
        aria-label="Visibility"
        value={choice}
        disabled={patch.isPending}
        onChange={(e) => {
          const next = e.target.value as Visibility;
          setChoice(next);
          if (next === "password" && !access.hasPassword) {
            return;
          }
          patch.mutate(
            { visibility: next },
            {
              onError: (error) => {
                setChoice(access.visibility);
                onError(error);
              },
            }
          );
        }}
      >
        <option value="private">Private, only invited people</option>
        <option value="link">Anyone signed in with the link can view</option>
        <option value="password">Anyone signed in with the password</option>
      </Select>
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
  const enabled = share?.enabled ?? false;

  return (
    <Section title="Share link">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
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
        <div className="flex gap-2">
          <Input readOnly aria-label="Share link" value={share.url} />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy link"
            onPress={async () => {
              await navigator.clipboard.writeText(share.url);
              toast.success("Link copied");
            }}
          >
            <Copy />
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
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate">
                {member.name || member.email}
                <span className="text-muted-foreground"> {member.email}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {member.userId ? null : (
                  <Badge variant="outline">pending</Badge>
                )}
                <Badge variant="secondary">{member.role}</Badge>
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

export const ShareBoardDialog = ({ board }: { board: Board }) => {
  const [open, setOpen] = useState(false);
  const { data: access } = useBoardAccess(board.id, open);

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline">
        <Share2 data-icon="inline-start" />
        Share
      </Button>
      <Dialog className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share “{board.title}”</DialogTitle>
          <DialogDescription>
            People you share with need a Narbel account.
          </DialogDescription>
        </DialogHeader>
        {access ? (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            <VisibilitySection boardId={board.id} access={access} />
            <Separator />
            <LinkSection boardId={board.id} access={access} />
            <Separator />
            <InviteSection boardId={board.id} />
            <Separator />
            <MembersSection boardId={board.id} access={access} />
          </div>
        ) : (
          <Skeleton className="h-40" />
        )}
      </Dialog>
    </DialogTrigger>
  );
};
