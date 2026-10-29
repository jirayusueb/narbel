import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("bg-muted skeleton-sheen rounded-[10px]", className)}
      {...props}
    />
  );
}

export { Skeleton };
