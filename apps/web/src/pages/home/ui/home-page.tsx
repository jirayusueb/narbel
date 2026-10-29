import { Button, buttonVariants } from "@narbel/ui/components/button";
import {
  useElementVisibility,
  useIntersectionObserver,
  useToggle,
} from "@reactuses/core";
import { Link } from "@tanstack/react-router";
import { Bot, Files, Pause, PenLine, Play, Plug } from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useRef } from "react";

import { useSession } from "@/entities/session";
import { PUBLIC_SERVER_URL } from "@/shared/config";
import {
  BrandMark,
  BrandSticker,
  Wordmark,
  chat,
  cloud,
  padlock,
  pin,
} from "@/shared/ui";

import "./home.css";

type Peer = "ink" | "moss" | "olive" | "agent";

interface Tile {
  title: string;
  meta: string;
  peers: Peer[];
}

const TILES_TOP: Tile[] = [
  { title: "System map", meta: "3 pages", peers: ["ink", "agent", "moss"] },
  { title: "Sprint retro", meta: "1 page", peers: ["moss", "olive"] },
  {
    title: "Onboarding flow",
    meta: "5 pages",
    peers: ["olive", "ink", "agent", "moss"],
  },
  { title: "API sketch", meta: "2 pages", peers: ["agent"] },
  { title: "Launch plan", meta: "4 pages", peers: ["ink", "olive"] },
  { title: "Data model", meta: "2 pages", peers: ["agent", "ink"] },
];

const TILES_BOTTOM: Tile[] = [
  { title: "Incident review", meta: "1 page", peers: ["moss", "ink", "agent"] },
  { title: "Pricing page", meta: "3 pages", peers: ["olive"] },
  { title: "Mobile nav", meta: "2 pages", peers: ["ink", "moss"] },
  {
    title: "Event storming",
    meta: "6 pages",
    peers: ["agent", "olive", "ink"],
  },
  { title: "Roadmap Q3", meta: "2 pages", peers: ["moss", "agent"] },
  { title: "Design crit", meta: "1 page", peers: ["olive", "ink", "moss"] },
];

const PEER_STYLE: Record<Peer, string> = {
  ink: "bg-foreground text-background",
  moss: "bg-chart-2 text-white",
  olive: "bg-chart-3 text-white",
  agent: "bg-citrus text-citrus-foreground",
};

const PEER_INITIAL: Record<Exclude<Peer, "agent">, string> = {
  ink: "M",
  moss: "T",
  olive: "R",
};

const MCP_TOOLS = [
  "list_boards",
  "create_board",
  "get_board",
  "list_pages",
  "add_page",
  "rename_page",
  "delete_page",
  "add_elements",
  "update_element",
  "delete_elements",
  "get_selection",
  "select",
  "edit_selection",
];

const HERO_WORDS = "One board for your team and its agents.".split(" ");

// Label swap on hover, the way intentapp.dev's buttons roll their text.
const Roll = ({ children }: { children: ReactNode }) => (
  <span className="relative inline-grid overflow-hidden py-0.5">
    <span className="ease-intent col-start-1 row-start-1 transition-transform duration-[450ms] group-hover/button:-translate-y-[130%] motion-reduce:transition-none motion-reduce:group-hover/button:translate-y-0">
      {children}
    </span>
    <span
      aria-hidden="true"
      className="ease-intent col-start-1 row-start-1 translate-y-[130%] transition-transform duration-[450ms] group-hover/button:translate-y-0 motion-reduce:hidden"
    >
      {children}
    </span>
  </span>
);

const Avatars = ({ peers }: { peers: Peer[] }) => (
  <span className="flex -space-x-1.5">
    {peers.map((peer, index) => (
      <span
        key={index}
        className={`ring-card flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ${PEER_STYLE[peer]}`}
      >
        {peer === "agent" ? (
          <Bot className="size-3.5" strokeWidth={2.2} />
        ) : (
          PEER_INITIAL[peer]
        )}
      </span>
    ))}
  </span>
);

const MarqueeRow = ({
  tiles,
  reverse,
  duration,
}: {
  tiles: Tile[];
  reverse?: boolean;
  duration: string;
}) => (
  <div className="home-marquee-track flex overflow-hidden">
    <div
      className="home-marquee flex w-max gap-2.5 pr-2.5"
      data-reverse={reverse ? "" : undefined}
      style={{ "--duration": duration } as CSSProperties}
    >
      {[...tiles, ...tiles].map((tile, index) => (
        <div
          key={index}
          className="bg-card shadow-surface flex w-64 shrink-0 flex-col gap-5 rounded-[20px] px-5 py-4"
        >
          <Avatars peers={tile.peers} />
          <span className="flex flex-col gap-1.5">
            <span className="font-display text-feature">{tile.title}</span>
            <span className="text-subtle-foreground flex items-center gap-1.5 text-xs">
              <Files className="size-3.5" />
              {tile.meta}
            </span>
          </span>
        </div>
      ))}
    </div>
  </div>
);

const Cursor = ({
  name,
  tone,
  ink,
  className,
}: {
  name: string;
  tone: string;
  ink: string;
  className: string;
}) => (
  <g className={className}>
    <path
      d="M0 0v19l5.2-4.6 3.6 7.7 3.3-1.5-3.6-7.6H15.5Z"
      className={`${tone} stroke-card`}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <rect
      x="14"
      y="22"
      width={name.length * 7.4 + 20}
      height="24"
      rx="8"
      className={tone}
    />
    <text x="24" y="38.5" className={ink} fontSize="12.5" fontWeight="600">
      {name}
    </text>
  </g>
);

const Box = ({
  x,
  y,
  label,
  className = "fill-card",
}: {
  x: number;
  y: number;
  label: string;
  className?: string;
}) => (
  <g>
    <rect
      x={x}
      y={y}
      width="190"
      height="90"
      rx="16"
      className={`${className} stroke-foreground`}
      strokeWidth="2"
    />
    <text
      x={x + 95}
      y={y + 51}
      textAnchor="middle"
      className="fill-foreground font-display"
      fontSize="22"
    >
      {label}
    </text>
  </g>
);

const Arrow = ({ d, head }: { d: string; head: string }) => (
  <g className="stroke-foreground" strokeWidth="2" strokeLinecap="round">
    <path d={d} fill="none" />
    <path d={head} fill="none" strokeLinejoin="round" />
  </g>
);

const at = (seconds: number, extra?: Record<string, string>) =>
  ({ "--at": `${seconds}s`, ...extra }) as CSSProperties;

// Illustrative scene: a teammate asks in a comment, an agent connected over MCP draws the answer.
const Stage = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useToggle(false);

  useIntersectionObserver(
    ref,
    ([entry]) => {
      if (entry?.isIntersecting) {
        setPlay(true);
      }
    },
    { threshold: 0.45 }
  );

  return (
    <figure className="mx-auto w-full max-w-6xl px-5 md:px-[30px]">
      <div
        ref={ref}
        data-play={play}
        className="home-stage bg-muted shadow-elevated overflow-hidden rounded-[25px] p-2 pt-0"
      >
        <div className="flex h-12 items-center gap-3 px-3" aria-hidden="true">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="bg-border-strong size-2.5 rounded-full" />
            <span className="bg-border-strong size-2.5 rounded-full" />
            <span className="bg-border-strong size-2.5 rounded-full" />
          </span>
          <span className="ml-2 flex items-center gap-1 overflow-hidden text-xs">
            <span className="bg-card shadow-surface rounded-[10px] px-3 py-1.5 font-medium">
              System map
            </span>
            <span className="text-muted-foreground px-3 py-1.5 max-sm:hidden">
              API sketch
            </span>
            <span className="text-muted-foreground px-3 py-1.5 max-md:hidden">
              Retro
            </span>
          </span>
          <span className="ml-auto flex items-center gap-2.5">
            <Avatars peers={["ink", "moss", "agent"]} />
            <span className="bg-citrus text-citrus-foreground rounded-[8px] px-2.5 py-1 text-xs font-medium max-sm:hidden">
              Share
            </span>
          </span>
        </div>
        <div className="bg-card overflow-hidden rounded-[20px]">
          <svg
            viewBox="0 30 960 440"
            className="block h-auto w-full font-sans"
            aria-hidden="true"
          >
            <Box x={80} y={90} label="web" />
            <Box x={385} y={90} label="server" />
            <Box x={690} y={90} label="postgres" />
            <Arrow d="M270 135H378" head="M370 128l8 7-8 7" />
            <Arrow d="M575 135H683" head="M675 128l8 7-8 7" />

            <rect
              x="385"
              y="300"
              width="190"
              height="90"
              rx="16"
              className="home-stage-show fill-citrus"
              style={at(5.6)}
            />
            <rect
              x="385"
              y="300"
              width="190"
              height="90"
              rx="16"
              className="home-stage-draw stroke-foreground fill-none"
              strokeWidth="2"
              style={at(2.9, { "--len": "540", "--dur": "2.6s" })}
            />
            <text
              x="480"
              y="351"
              textAnchor="middle"
              className="home-stage-show fill-citrus-foreground font-display"
              fontSize="22"
              style={at(5.8)}
            >
              redis cache
            </text>
            <g className="home-stage-show" style={at(6.2)}>
              <Arrow d="M480 182V292" head="M473 284l7 8 7-8" />
            </g>

            <g className="home-stage-show" style={at(1.6)}>
              <circle cx="612" cy="262" r="15" className="fill-foreground" />
              <text
                x="612"
                y="267"
                textAnchor="middle"
                className="fill-background"
                fontSize="12"
                fontWeight="600"
              >
                M
              </text>
              <rect
                x="640"
                y="230"
                width="272"
                height="62"
                rx="15"
                className="fill-background"
              />
              <text
                x="656"
                y="254"
                className="fill-foreground"
                fontSize="12.5"
                fontWeight="600"
              >
                Mai
              </text>
              <text x="656" y="276" className="fill-foreground" fontSize="14">
                Can we cache board reads?
              </text>
            </g>
            <g className="home-stage-show" style={at(7.2)}>
              <rect
                x="640"
                y="300"
                width="272"
                height="62"
                rx="15"
                className="fill-citrus"
              />
              <text
                x="656"
                y="324"
                className="fill-citrus-foreground"
                fontSize="12.5"
                fontWeight="600"
              >
                Agent · MCP
              </text>
              <text
                x="656"
                y="346"
                className="fill-citrus-foreground"
                fontSize="14"
              >
                Added a cache under the server.
              </text>
            </g>

            <g transform="translate(150 236)">
              <Cursor
                name="Theo"
                tone="fill-chart-3"
                ink="fill-white"
                className="home-stage-show"
              />
            </g>
            <Cursor
              name="Mai"
              tone="fill-foreground"
              ink="fill-background"
              className="home-stage-mai"
            />
            <Cursor
              name="Agent"
              tone="fill-citrus"
              ink="fill-citrus-foreground"
              className="home-stage-agent"
            />
          </svg>
        </div>
      </div>
      <figcaption className="text-subtle-foreground mt-4 text-center text-[13px]">
        Illustration. Agents connect over MCP and edit the live board like any
        other collaborator.
        <span className="sr-only">
          {" "}
          A teammate comments asking to cache board reads, and an agent draws a
          Redis cache under the server and replies.
        </span>
      </figcaption>
    </figure>
  );
};

const FEATURES: {
  id?: string;
  title: string;
  body: string;
  icon: typeof cloud;
}[] = [
  {
    title: "Live by default.",
    body: "Every board is one shared document that merges edits from every browser as they happen. Cursors and names show who is where, and you can follow someone across pages.",
    icon: cloud,
  },
  {
    id: "agents",
    title: "Agents draw with you.",
    body: "Create an API key, point any MCP client at your narbel server, and the agent can list boards, read them, and add, update or delete elements. Its edits stream onto the board while you keep drawing.",
    icon: chat,
  },
  {
    title: "Comments where the work is.",
    body: "Pin a comment to a spot on the canvas and write it with real formatting. Pages keep one board tidy when the idea grows.",
    icon: pin,
  },
  {
    title: "Share on your terms.",
    body: "Keep a board private, open it to signed-in people with the link, lock it behind a password, or invite people by email. Viewers get a read-only board.",
    icon: padlock,
  },
];

const McpSnippet = () => (
  <div className="bg-card shadow-surface mt-8 overflow-hidden rounded-[20px]">
    <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
      <span className="bg-citrus text-citrus-foreground rounded-[8px] px-2 py-0.5 text-xs font-medium">
        POST
      </span>
      <code className="text-moss truncate font-mono text-[13px]">
        {PUBLIC_SERVER_URL}/mcp
      </code>
    </div>
    <pre className="bg-muted text-muted-foreground mx-2 mb-2 rounded-[15px] px-4 py-3.5 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
      <span className="text-foreground">x-api-key</span>: your-key{"\n"}
      <span className="text-foreground">tools</span>: {MCP_TOOLS.join(", ")}
    </pre>
  </div>
);

const Cta = ({ signedIn }: { signedIn: boolean }) => (
  <div className="flex flex-wrap items-center justify-center gap-2.5">
    <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}>
      <Link
        to={signedIn ? "/dashboard" : "/login"}
        className={buttonVariants({ size: "lg" })}
      >
        <PenLine data-icon="inline-start" />
        <Roll>{signedIn ? "Open your boards" : "Start drawing"}</Roll>
      </Link>
    </motion.div>
    <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}>
      <Link
        to="/"
        hash="agents"
        className={buttonVariants({ variant: "secondary", size: "lg" })}
      >
        <Plug data-icon="inline-start" />
        <Roll>Connect an agent</Roll>
      </Link>
    </motion.div>
  </div>
);

// CSS, not motion: the hero is server-rendered and must animate before (or without) hydration.
const rise = (delayMs: number) =>
  ({ "--delay": `${delayMs}ms` }) as CSSProperties;

// The wordmark rises into place as the reader reaches the end of the page, tied to scroll so it settles exactly at the bottom.
const FooterWordmark = () => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["45%", "0%"]);
  const tilt = useTransform(scrollYProgress, [0, 1], [-24, 0]);
  return (
    <div ref={ref} className="overflow-clip pt-[4vw]" aria-hidden="true">
      <motion.div
        className="flex items-end gap-[3vw]"
        style={reduce ? undefined : { y }}
      >
        <motion.span
          className="shrink-0"
          style={reduce ? undefined : { rotate: tilt }}
        >
          <BrandMark className="size-[17.5vw]" />
        </motion.span>
        <Wordmark className="text-[24vw] leading-[0.74] tracking-[-0.04em]" />
      </motion.div>
    </div>
  );
};

export const HomePage = () => {
  const { data: session } = useSession();
  const signedIn = Boolean(session);
  const [paused, togglePaused] = useToggle(false);
  const bandRef = useRef<HTMLDivElement>(null);
  const [bandVisible] = useElementVisibility(bandRef);

  return (
    <div className="flex-1 overflow-x-clip">
      <section className="flex flex-col items-center px-5 pt-16 pb-20 text-center md:px-[30px] md:pt-24 md:pb-28">
        <h1 className="font-display lg:text-display max-w-[13ch] text-[44px] leading-[0.95] font-normal tracking-[-0.04em] md:text-[72px]">
          {HERO_WORDS.map((word, index) => (
            <Fragment key={index}>
              {index > 0 ? " " : null}
              <span className="home-rise inline-block" style={rise(index * 40)}>
                {word}
              </span>
            </Fragment>
          ))}
        </h1>
        <p
          className="home-rise text-muted-foreground mt-8 max-w-[34rem] text-[17px] leading-[1.4] text-pretty md:text-lg"
          style={rise(200)}
        >
          Draw together in real time, drop in images, leave comments on the
          canvas, and let AI agents read and edit the same board over MCP.
        </p>
        <div className="home-rise mt-10" style={rise(280)}>
          <Cta signedIn={signedIn} />
        </div>
      </section>

      <div
        ref={bandRef}
        className="home-marquee-band"
        data-paused={paused || !bandVisible ? "" : undefined}
      >
        <div
          aria-hidden="true"
          className="flex flex-col gap-2.5 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]"
        >
          <MarqueeRow tiles={TILES_TOP} duration="80s" />
          <MarqueeRow tiles={TILES_BOTTOM} duration="95s" reverse />
        </div>
        <div className="text-subtle-foreground mt-3 flex items-center justify-center gap-1.5 text-[13px] motion-reduce:hidden">
          Example boards
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={paused ? "Play example boards" : "Pause example boards"}
            onPress={() => togglePaused()}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
        </div>
      </div>

      <div className="pt-24 md:pt-32">
        <Stage />
      </div>

      <section className="mx-auto flex max-w-6xl flex-col px-5 pt-28 md:px-[30px] md:pt-40">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            id={feature.id}
            className="grid scroll-mt-10 gap-y-3 py-12 md:grid-cols-12 md:gap-x-10 md:gap-y-2 md:py-16"
          >
            <div
              aria-hidden="true"
              className="-mb-3 -ml-6 size-32 md:col-span-5 md:row-start-1 md:size-44"
            >
              <BrandSticker
                icon={feature.icon}
                loop={false}
                enter={0.1}
                replayOnHover
              />
            </div>
            <h2 className="font-display text-headline md:text-title font-normal md:col-span-5 md:row-start-2">
              {feature.title}
            </h2>
            <div className="md:col-span-6 md:col-start-7 md:row-start-2 md:pt-2">
              <p className="text-muted-foreground text-[17px] leading-[1.45]">
                {feature.body}
              </p>
              {feature.id === "agents" ? <McpSnippet /> : null}
            </div>
          </article>
        ))}
      </section>

      <section className="flex flex-col items-center px-5 pt-28 text-center md:px-[30px] md:pt-40">
        <h2 className="font-display max-w-[14ch] text-[40px] leading-[0.95] font-normal tracking-[-0.04em] md:text-[64px]">
          Draw the next thing together.
        </h2>
        <p className="text-muted-foreground mt-6 max-w-[30rem] text-[17px] leading-[1.4]">
          Create a board, invite your team, and hand an agent a key.
        </p>
        <div className="mt-10">
          <Cta signedIn={signedIn} />
        </div>
      </section>

      <footer className="px-5 pt-40 pb-8 md:px-[30px] md:pt-60">
        <nav
          aria-label="Footer"
          className="mb-16 flex flex-col items-center gap-3 text-sm md:mb-24"
        >
          <Link
            to={signedIn ? "/dashboard" : "/login"}
            className="hover:decoration-foreground underline decoration-transparent underline-offset-4 transition-colors"
          >
            {signedIn ? "Boards" : "Sign in"}
          </Link>
          <Link
            to="/"
            hash="agents"
            className="hover:decoration-foreground underline decoration-transparent underline-offset-4 transition-colors"
          >
            Agents
          </Link>
        </nav>
        <FooterWordmark />
      </footer>
    </div>
  );
};
