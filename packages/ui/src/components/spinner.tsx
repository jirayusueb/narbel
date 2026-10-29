import { cn } from "cn";

// A thin arc that grows and shrinks as it turns, so it reads as progress rather than a static wheel.
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        "size-4 animate-[spin_0.9s_linear_infinite] motion-reduce:animate-[spin_2.4s_linear_infinite]",
        className
      )}
      {...props}
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.75"
        opacity="0.18"
      />
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="28 100"
        className="origin-center animate-[spinner-arc_1.4s_cubic-bezier(0.6,0,0.1,1)_infinite] motion-reduce:animate-none"
      />
    </svg>
  );
}

export { Spinner };
