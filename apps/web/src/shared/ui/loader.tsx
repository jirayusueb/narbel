import { cn } from "@narbel/ui/lib/utils";

import "./loader.css";

// Same geometry as BrandMark; pathLength="1" lets the CSS draw the stroke in unit lengths.
export const LoaderMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    className={cn("loader-mark size-10 overflow-visible", className)}
  >
    <path
      className="loader-stroke"
      pathLength={1}
      d="M7 27V15.5a8.5 8.5 0 0 1 17 0V27"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <circle
      className="loader-ring stroke-citrus"
      cx="26.5"
      cy="5.5"
      r="3.75"
      strokeWidth="1.5"
    />
    <circle
      className="loader-dot"
      cx="26.5"
      cy="5.5"
      r="3.75"
      fill="currentColor"
    />
  </svg>
);

export const Loader = ({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) => (
  <div
    className={cn(
      "flex min-h-[60svh] flex-1 flex-col items-center justify-center gap-4 pb-10",
      className
    )}
  >
    <LoaderMark className="text-foreground" />
    <output className="text-shimmer text-[13px] font-medium tracking-[-0.01em]">
      {label}
    </output>
  </div>
);
