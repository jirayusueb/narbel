import { useMemo, useState } from "react";

import type { Mentionable, MentionQuery } from "./mention";

const MAX_SUGGESTIONS = 6;

// Suggestion list state for the `@` trigger the MentionSuggest extension reports.
export const useMention = (members: Mentionable[]) => {
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);

  // Reset the highlighted row when the query changes (adjusted during render, not in an effect).
  const [seenQuery, setSeenQuery] = useState(mention?.query);
  if (mention?.query !== seenQuery) {
    setSeenQuery(mention?.query);
    setCursor(0);
  }

  const matches = useMemo(() => {
    if (!mention || dismissedAt === mention.from) {
      return [];
    }
    const query = mention.query.toLowerCase();
    return members
      .filter(
        (member) =>
          member.username &&
          (member.username.startsWith(query) ||
            member.name.toLowerCase().includes(query))
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [mention, members, dismissedAt]);

  const active = Math.min(cursor, Math.max(matches.length - 1, 0));
  return {
    mention,
    onQuery: setMention,
    matches,
    active,
    move: (step: number) =>
      setCursor((active + step + matches.length) % matches.length),
    dismiss: () => setDismissedAt(mention?.from ?? null),
  };
};
