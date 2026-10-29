import { cn } from "@narbel/ui/lib/utils";

// The arch is one pen stroke forming the "n"; the dot is a collaborator's cursor landing on it.
export const BrandMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    className={cn("size-8", className)}
  >
    <path
      d="M7 27V15.5a8.5 8.5 0 0 1 17 0V27"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <circle cx="26.5" cy="5.5" r="3.75" fill="currentColor" />
  </svg>
);

export const Wordmark = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "font-display text-feature leading-none tracking-[-0.04em]",
      className
    )}
  >
    narbel
  </span>
);
