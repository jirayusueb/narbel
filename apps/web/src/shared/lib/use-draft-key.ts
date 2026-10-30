import { useRef } from "react";

/**
 * One Idempotency-Key per draft content: a double submit or a retry of the same content reuses it,
 * edited content gets a fresh key (the server rejects a reused key with a different body),
 * and `rotate` after a success lets the same text be sent again on purpose.
 */
export const useDraftKey = () => {
  const draft = useRef<{ content: string; key: string } | null>(null);
  return {
    get: (content: string) => {
      if (draft.current?.content !== content) {
        // getRandomValues, not randomUUID: plain-http IP:port deploys are not a secure context
        const key = Array.from(
          crypto.getRandomValues(new Uint8Array(16)),
          (b) => b.toString(16).padStart(2, "0")
        ).join("");
        draft.current = { content, key };
      }
      return draft.current.key;
    },
    rotate: () => {
      draft.current = null;
    },
  };
};
