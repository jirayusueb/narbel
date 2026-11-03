import { buttonVariants } from "@narbel/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";

// A waiting OAuth request is signed over the raw query, and the router re-serialises
// search params (a long numeric `state` loses digits), so the switch between the two
// auth pages pushes the query verbatim. Modified clicks keep the browser's default.
export const AuthSwitchLink = ({
  to,
  children,
}: {
  to: "/sign-in" | "/sign-up";
  children: ReactNode;
}) => {
  const router = useRouter();

  return (
    <Link
      to={to}
      search
      className={buttonVariants({ variant: "link", size: "sm" })}
      onClick={(event) => {
        const modified =
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (modified || event.button !== 0) {
          return;
        }
        event.preventDefault();
        router.history.push(`${to}${window.location.search}`);
      }}
    >
      {children}
    </Link>
  );
};
