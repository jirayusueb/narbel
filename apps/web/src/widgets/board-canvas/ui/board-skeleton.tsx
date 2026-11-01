import { Skeleton } from "@narbel/ui/components/skeleton";

import { Loader } from "@/shared/ui";

// Islands rest on the canvas with the surface shadow, as Excalidraw's own islands do (--shadow-island).
const ISLAND = "absolute rounded-lg shadow-surface";

// Same condition as PHONE_QUERY (phone-query.ts). A pure-CSS switch, so the first paint (including SSR) already
// has the right layout; the class names are spelled out whole because Tailwind scans for literals.
const PHONE =
  "hidden [@media_(max-width:730px),(max-height:499px)_and_(max-width:999px)]:block";
const DESKTOP =
  "[@media_(max-width:730px),(max-height:499px)_and_(max-width:999px)]:hidden";

// Ghosts of the board's own islands in their final positions, so the canvas arrives without a layout jump.
export const BoardSkeleton = ({
  label = "Opening board",
}: {
  label?: string;
}) => (
  // Excalidraw's own canvas colours (#121212 is its inverted dark canvas), not app tokens: the ghost must match it.
  <div className="relative h-svh w-full overflow-hidden bg-white dark:bg-[#121212]">
    <Skeleton className={`${ISLAND} inset-x-3 top-3 h-12 ${PHONE}`} />
    <Skeleton className={`${ISLAND} inset-x-3 bottom-3 h-14 ${PHONE}`} />
    <Skeleton
      className={`${ISLAND} top-4 left-4 size-9 rounded-md ${DESKTOP}`}
    />
    <Skeleton className={`${ISLAND} top-4 left-[68px] h-10 w-60 ${DESKTOP}`} />
    <Skeleton
      className={`${ISLAND} top-4 left-1/2 h-11 w-[min(420px,40vw)] -translate-x-1/2 ${DESKTOP}`}
    />
    <Skeleton className={`${ISLAND} top-4 right-4 h-10 w-80 ${DESKTOP}`} />
    <Skeleton className={`${ISLAND} bottom-4 left-4 h-9 w-40 ${DESKTOP}`} />
    <Skeleton
      className={`${ISLAND} bottom-4 left-1/2 h-10 w-56 -translate-x-1/2 ${DESKTOP}`}
    />
    <Skeleton
      className={`${ISLAND} right-4 bottom-4 size-9 rounded-md ${DESKTOP}`}
    />
    <Loader label={label} className="absolute inset-0 pb-0" />
  </div>
);
