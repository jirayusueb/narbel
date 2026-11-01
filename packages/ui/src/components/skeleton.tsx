import { cn } from "@narbel/ui/lib/utils";

// Skeletons mounted in one commit are measured together in the next frame: all reads, then all writes.
const pending = new Set<HTMLElement>();

const alignSheens = () => {
  const lefts = [...pending].map(
    (el) => [el, el.getBoundingClientRect().left] as const
  );
  pending.clear();
  for (const [el, left] of lefts) {
    el.style.setProperty("--sheen-x", `${left}px`);
  }
};

// shortcut: measured once at mount, so a resize mid-load misaligns the band until the skeleton remounts.
const alignSheen = (el: HTMLDivElement | null) => {
  if (!el) {
    return;
  }
  if (pending.size === 0) {
    requestAnimationFrame(alignSheens);
  }
  pending.add(el);
};

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={alignSheen}
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("bg-muted skeleton-sheen rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
