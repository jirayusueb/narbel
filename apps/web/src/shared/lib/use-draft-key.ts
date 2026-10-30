import { useRef } from "react";

/** One Idempotency-Key per draft: reused by a double submit or a retry, rotated after a success. */
export const useDraftKey = () => {
  const key = useRef(crypto.randomUUID());
  return {
    get: () => key.current,
    rotate: () => {
      key.current = crypto.randomUUID();
    },
  };
};
