import { Button, buttonVariants } from "@narbel/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@narbel/ui/components/dropdown-menu";
import { Skeleton } from "@narbel/ui/components/skeleton";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";

import { useSession } from "@/entities/session";
import { UserAvatar, useMe } from "@/entities/user";
import { authClient } from "@/shared/lib";

const THEMES = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
] as const;

export const UserMenu = ({ compact = false }: { compact?: boolean }) => {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const { data: me } = useMe();
  const { theme = "system", setTheme } = useTheme();

  if (isPending) {
    return <Skeleton className="h-10 w-28 rounded-full" />;
  }

  if (!session) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          to="/login"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "max-sm:hidden",
          })}
        >
          Sign in
        </Link>
        <Link to="/login" className={buttonVariants({ variant: "citrus" })}>
          Start drawing
        </Link>
      </div>
    );
  }

  const { id: userId, email } = session.user;
  const user = {
    id: userId,
    name: me?.name ?? session.user.name,
    username: me?.username ?? null,
    avatarUrl: me?.avatarUrl ?? null,
  };
  const { name } = user;

  return (
    <DropdownMenuTrigger>
      <Button
        variant="secondary"
        aria-label={`Account menu for ${name}`}
        className={`h-10 gap-2.5 rounded-full pl-1 ${compact ? "pr-1" : "pr-4"}`}
      >
        <UserAvatar user={user} size={32} />
        {compact ? null : (
          <span className="max-w-32 truncate max-sm:hidden">{name}</span>
        )}
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">{name}</span>
            <span className="truncate">
              {user.username ? `@${user.username}` : email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            textValue="Profile"
            onAction={() => navigate({ to: "/settings/profile" })}
          >
            <UserRound />
            Profile
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup
          aria-label="Theme"
          selectionMode="single"
          selectedKeys={[theme]}
          onSelectionChange={(keys) => {
            const [next] = [...(keys === "all" ? [] : keys)];
            if (next) {
              setTheme(String(next));
            }
          }}
        >
          {THEMES.map(({ id, label, Icon }) => (
            <DropdownMenuItem key={id} id={id} textValue={label}>
              <Icon />
              {label}
              {theme === id ? (
                <motion.span
                  layoutId="theme-indicator"
                  aria-hidden="true"
                  className="bg-citrus ring-foreground/30 ml-auto size-2 rounded-full ring-1"
                  transition={{ duration: 0.25, ease: [0.6, 0, 0.1, 1] }}
                />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            textValue="Sign out"
            onAction={() => {
              authClient.signOut({
                fetchOptions: { onSuccess: () => navigate({ to: "/" }) },
              });
            }}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
};
