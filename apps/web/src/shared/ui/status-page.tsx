import { Button, buttonVariants } from "@narbel/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import "./status-page.css";

type Tone = "missing" | "error";

const TONE: Record<Tone, { box: string; fill: string; chip: string }> = {
  missing: {
    box: "border-moss",
    fill: "fill-citrus",
    chip: "bg-citrus text-citrus-foreground",
  },
  error: {
    box: "border-destructive",
    fill: "fill-destructive",
    chip: "bg-destructive text-background",
  },
};

const CORNERS = [
  "-top-[5px] -left-[5px]",
  "-top-[5px] -right-[5px]",
  "-bottom-[5px] -left-[5px]",
  "-bottom-[5px] -right-[5px]",
];

// A word on the board, selected by the agent the way Excalidraw selects a shape.
const Scene = ({
  word,
  tone,
  says,
}: {
  word: string;
  tone: Tone;
  says: string;
}) => {
  const colors = TONE[tone];
  return (
    <div aria-hidden="true" className="relative select-none">
      <p className="status-word font-display text-[clamp(7rem,24vw,18rem)] leading-none font-normal tracking-[-0.04em]">
        {word}
      </p>
      <div
        className={`status-selection absolute -inset-x-[0.12em] -top-[0.02em] -bottom-[0.13em] border-[1.5px] text-[clamp(7rem,24vw,18rem)] ${colors.box}`}
      >
        {CORNERS.map((corner) => (
          <span
            key={corner}
            className={`bg-card absolute size-2.5 rounded-[3px] border-[1.5px] ${corner} ${colors.box}`}
          />
        ))}
        <span
          className={`absolute -top-7 left-1/2 h-5 -translate-x-1/2 border-l-[1.5px] ${colors.box}`}
        />
        <span
          className={`bg-card absolute -top-9 left-1/2 size-3 -translate-x-1/2 rounded-full border-[1.5px] ${colors.box}`}
        />
        <div className="status-cursor absolute -right-3 -bottom-4">
          <svg
            viewBox="0 0 16 22"
            className={`stroke-foreground size-5 ${colors.fill}`}
          >
            <path
              d="M1 1v17l4.6-4.1 3.2 6.9 2.9-1.3-3.2-6.8H14.6Z"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <div className="absolute top-5 right-0 flex flex-col items-end gap-1.5 sm:right-auto sm:left-4 sm:items-start">
            <span
              className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${colors.chip}`}
            >
              Agent
            </span>
            <span className="status-bubble bg-primary text-primary-foreground shadow-elevated w-max max-w-[min(15rem,70vw)] rounded-lg rounded-tr-[4px] px-3.5 py-2.5 text-left text-[13px] leading-snug sm:rounded-tl-[4px] sm:rounded-tr-lg">
              {says}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusPage = ({
  word,
  tone,
  says,
  title,
  description,
  actions,
  children,
}: {
  word: string;
  tone: Tone;
  says: string;
  title: string;
  description: string;
  actions: ReactNode;
  children?: ReactNode;
}) => (
  <div className="relative flex flex-1 flex-col items-center justify-center overflow-x-clip px-5 pt-16 pb-20">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--border-strong)_1.2px,transparent_1.7px)] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_40%,black,transparent)] [background-size:22px_22px]"
    />
    <Scene word={word} tone={tone} says={says} />
    <div className="status-copy relative mt-32 flex max-w-lg flex-col items-center gap-3 text-center sm:mt-20">
      <h1 className="font-display text-headline md:text-title font-normal">
        {title}
      </h1>
      <p className="text-muted-foreground text-[15px] text-pretty">
        {description}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2.5">
        {actions}
      </div>
      {children}
    </div>
  </div>
);

export const NotFound = ({
  title = "This page isn’t on any board.",
  description = "The link may be old, or the address has a typo.",
  to = "/",
  action = "Back home",
  signInRedirect,
}: {
  title?: string;
  description?: string;
  to?: "/" | "/dashboard";
  action?: string;
  signInRedirect?: string;
}) => (
  <StatusPage
    word="404"
    tone="missing"
    says="I checked every board. Nothing lives at this address."
    title={title}
    description={description}
    actions={
      signInRedirect ? (
        <Link
          to="/login"
          search={{ redirect: signInRedirect }}
          className={buttonVariants()}
        >
          Sign in
        </Link>
      ) : (
        <>
          <Link to={to} className={buttonVariants()}>
            {action}
          </Link>
          {to === "/dashboard" ? null : (
            <Link
              to="/dashboard"
              className={buttonVariants({ variant: "secondary" })}
            >
              Your boards
            </Link>
          )}
        </>
      )
    }
  />
);

export const ErrorState = ({ error, reset }: ErrorComponentProps) => {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    <StatusPage
      word="Oops"
      tone="error"
      says="That wasn’t supposed to happen."
      title="Something broke while loading this page."
      description="Try again. If it keeps happening, the details below show where it failed."
      actions={
        <>
          <Button
            onPress={() => {
              reset();
              router.invalidate();
            }}
          >
            <RotateCcw data-icon="inline-start" />
            Try again
          </Button>
          <Link to="/" className={buttonVariants({ variant: "secondary" })}>
            Back home
          </Link>
        </>
      }
    >
      {message ? (
        <details className="bg-card shadow-surface mt-6 w-full rounded-lg text-left">
          <summary className="text-muted-foreground hover:text-foreground focus-visible:outline-ring cursor-pointer rounded-lg px-4 py-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-solid">
            Error details
          </summary>
          <pre className="bg-muted text-muted-foreground mx-2 mb-2 overflow-x-auto rounded-md px-3.5 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
            {message}
          </pre>
        </details>
      ) : null}
    </StatusPage>
  );
};
