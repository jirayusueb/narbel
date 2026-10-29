import { useEffect, useRef } from "react";

// Calls `onLoadMore` whenever the returned sentinel scrolls into view of its scroll parent.
export const useLoadMore = (onLoadMore: () => void, enabled: boolean) => {
  const sentinel = useRef<HTMLDivElement>(null);
  const callback = useRef(onLoadMore);
  useEffect(() => {
    callback.current = onLoadMore;
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!(node && enabled)) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          callback.current();
        }
      },
      { rootMargin: "160px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return sentinel;
};
