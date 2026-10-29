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

import { useSession } from "@/entities/session";
import { authClient } from "@/shared/lib";

export const UserMenu = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <Skeleton className="h-8 w-24" />;
  }

  if (!session) {
    return (
      <Link to="/login" className={buttonVariants({ variant: "outline" })}>
        Sign in
      </Link>
    );
  }

  return (
    <DropdownMenuTrigger>
      <Button variant="outline">{session.user.name}</Button>
      <DropdownMenu placement="bottom end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem isDisabled>{session.user.email}</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onAction={() => {
              authClient.signOut({
                fetchOptions: { onSuccess: () => navigate({ to: "/" }) },
              });
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
};
