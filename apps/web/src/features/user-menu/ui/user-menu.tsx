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
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useSession } from "@/entities/session";
import { authClient } from "@/shared/lib";

const THEMES = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
] as const;

export const UserMenu = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
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

  const { name, email } = session.user;
  const initials = name
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenuTrigger>
      <Button
        variant="secondary"
        aria-label={`Account menu for ${name}`}
        className="h-10 gap-2.5 rounded-full pr-4 pl-1"
      >
        <span
          aria-hidden="true"
          className="bg-citrus text-citrus-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold"
        >
          {initials}
        </span>
        <span className="max-w-32 truncate max-sm:hidden">{name}</span>
      </Button>
      <DropdownMenu placement="bottom end" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-foreground text-sm font-medium">{name}</span>
            <span className="truncate">{email}</span>
          </DropdownMenuLabel>
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
