import { Skeleton } from "@narbel/ui/components/skeleton";

import { Loader } from "@/shared/ui";

const ISLAND = "absolute rounded-[15px] shadow-[0_10px_20px_rgb(0_0_0/0.06)]";

// Ghosts of the board's own islands in their final positions, so the canvas arrives without a layout jump.
export const BoardSkeleton = ({
  label = "Opening board",
}: {
  label?: string;
}) => (
  <div className="relative h-svh w-full overflow-hidden bg-white dark:bg-[#121212]">
    <div className="max-[730px]:hidden">
      <Skeleton className={`${ISLAND} top-4 left-4 size-9 rounded-[10px]`} />
      <Skeleton className={`${ISLAND} top-4 left-[68px] h-10 w-60`} />
      <Skeleton
        className={`${ISLAND} top-4 left-1/2 h-11 w-[min(420px,40vw)] -translate-x-1/2`}
      />
      <Skeleton className={`${ISLAND} top-4 right-4 h-10 w-80`} />
      <Skeleton className={`${ISLAND} bottom-4 left-4 h-9 w-40`} />
      <Skeleton
        className={`${ISLAND} bottom-4 left-1/2 h-10 w-56 -translate-x-1/2`}
      />
      <Skeleton
        className={`${ISLAND} right-4 bottom-4 size-9 rounded-[10px]`}
      />
    </div>
    <div className="min-[731px]:hidden">
      <Skeleton className={`${ISLAND} inset-x-3 top-3 h-12`} />
      <Skeleton className={`${ISLAND} inset-x-3 bottom-3 h-14`} />
    </div>
    <Loader label={label} className="absolute inset-0 pb-0" />
  </div>
);
