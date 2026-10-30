import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@narbel/ui/components/input-group";
import { Spinner } from "@narbel/ui/components/spinner";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Search, Type, X } from "lucide-react";

import { useSearchBoards } from "@/entities/board";
import type { BoardSearchMatch, BoardSearchResult } from "@/entities/board";
import { useDebounced } from "@/shared/lib";

import { highlight } from "../model/highlight";

const MIN_LENGTH = 2;
const DEBOUNCE_MS = 200;

/** True once the query is long enough to search; the dashboard swaps its grid for the results then. */
export const isSearching = (query: string) => query.trim().length >= MIN_LENGTH;

export const BoardSearchField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <InputGroup className="max-w-md">
    <InputGroupAddon>
      <Search aria-hidden />
    </InputGroupAddon>
    <InputGroupInput
      type="search"
      className="[&::-webkit-search-cancel-button]:appearance-none"
      aria-label="Search boards"
      placeholder="Search titles, text and comments"
      autoComplete="off"
      spellCheck={false}
      maxLength={100}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && value !== "") {
          e.preventDefault();
          onChange("");
        }
      }}
    />
    {value === "" ? null : (
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label="Clear search"
          onPress={() => onChange("")}
        >
          <X />
        </InputGroupButton>
      </InputGroupAddon>
    )}
  </InputGroup>
);

const Marked = ({ text, query }: { text: string; query: string }) =>
  highlight(text, query).map((piece, index) =>
    piece.hit ? (
      <mark
        // oxlint-disable-next-line react/no-array-index-key -- pieces are positional and never reorder
        key={index}
        className="bg-citrus text-citrus-foreground rounded-sm px-0.5"
      >
        {piece.text}
      </mark>
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- pieces are positional and never reorder
      <span key={index}>{piece.text}</span>
    )
  );

const FOCUS =
  "focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-solid";

const MatchLink = ({
  boardId,
  match,
  query,
}: {
  boardId: string;
  match: BoardSearchMatch;
  query: string;
}) => {
  const Icon = match.kind === "comment" ? MessageSquare : Type;
  return (
    <Link
      to="/boards/$boardId"
      params={{ boardId }}
      search={{ page: match.pageId, comment: match.commentId }}
      className={`${FOCUS} text-muted-foreground hover:text-foreground flex items-start gap-2 text-sm break-words transition-colors`}
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="sr-only">
        {match.kind === "comment" ? "Comment: " : "Text: "}
      </span>
      <span>
        <Marked text={match.snippet} query={query} />
      </span>
    </Link>
  );
};

const Result = ({
  result: { board, matches },
  query,
}: {
  result: BoardSearchResult;
  query: string;
}) => {
  const inside = matches.filter((match) => match.kind !== "title");
  return (
    <li className="bg-card shadow-surface flex flex-col gap-3 rounded-xl p-5">
      <h3 className="font-display text-feature leading-tight font-normal break-words">
        <Link
          to="/boards/$boardId"
          params={{ boardId: board.id }}
          className={FOCUS}
        >
          <Marked text={board.title} query={query} />
        </Link>
        {board.shared ? (
          <span className="bg-muted text-muted-foreground ml-3 rounded-sm px-2 py-0.5 align-middle font-sans text-xs font-medium capitalize">
            {board.role}
          </span>
        ) : null}
      </h3>
      {inside.length ? (
        <ul className="flex flex-col gap-1.5">
          {inside.map((match) => (
            <li
              key={`${match.kind}:${match.commentId ?? match.pageId}:${match.snippet}`}
            >
              <MatchLink boardId={board.id} match={match} query={query} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const BoardSearchResults = ({ query }: { query: string }) => {
  const trimmed = query.trim();
  const settled = useDebounced(trimmed, DEBOUNCE_MS);
  const ready = settled === trimmed;
  const { data, error, isFetching, refetch } = useSearchBoards(settled);
  const waiting = !ready || (isFetching && !data);

  let status = "";
  if (waiting) {
    status = "Searching";
  } else if (error) {
    status = "Search failed";
  } else if (data) {
    status =
      data.length === 0
        ? `No boards match ${trimmed}`
        : `${data.length} ${data.length === 1 ? "board" : "boards"} found`;
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={waiting}>
      <output className="text-muted-foreground flex items-center gap-2 text-sm">
        {waiting ? <Spinner /> : null}
        {status}
      </output>
      {!waiting && error ? (
        <div className="bg-card shadow-surface flex flex-col items-start gap-3 rounded-xl p-5">
          <p className="text-destructive text-sm">{error.message}</p>
          <button
            type="button"
            className={`${FOCUS} text-sm font-medium underline underline-offset-4`}
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!waiting && data?.length ? (
        <ul className="flex flex-col gap-2.5">
          {data.map((result) => (
            <Result key={result.board.id} result={result} query={trimmed} />
          ))}
        </ul>
      ) : null}
    </div>
  );
};
