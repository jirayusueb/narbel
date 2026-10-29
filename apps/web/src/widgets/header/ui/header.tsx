import { Separator } from "@narbel/ui/components/separator";
import { Link } from "@tanstack/react-router";

import { UserMenu } from "@/features/user-menu";

export const Header = () => (
  <header>
    <div className="flex items-center justify-between px-3 py-2">
      <nav className="flex gap-4 text-sm">
        <Link
          to="/"
          activeProps={{ className: "font-medium" }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>
        <Link to="/dashboard" activeProps={{ className: "font-medium" }}>
          Boards
        </Link>
      </nav>
      <UserMenu />
    </div>
    <Separator />
  </header>
);
