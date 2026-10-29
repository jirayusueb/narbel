import { buttonVariants } from "@narbel/ui/components/button";
import { Link } from "@tanstack/react-router";

import { BrandMark } from "./brand";

export const NotFound = ({
  title = "This page doesn’t exist",
  description = "The link may be old, or the address has a typo.",
  to = "/",
  action = "Back home",
}: {
  title?: string;
  description?: string;
  to?: "/" | "/dashboard";
  action?: string;
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-6 px-5 pb-20 text-center">
    <BrandMark className="text-subtle-foreground size-10" />
    <div className="flex max-w-md flex-col gap-3">
      <h1 className="font-display text-title font-normal">{title}</h1>
      <p className="text-muted-foreground text-[15px] text-pretty">
        {description}
      </p>
    </div>
    <Link to={to} className={buttonVariants({ variant: "secondary" })}>
      {action}
    </Link>
  </div>
);
