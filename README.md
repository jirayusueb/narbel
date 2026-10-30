# narbel

Collaborative whiteboard. Signed-in users own boards drawn with [Excalidraw](https://github.com/excalidraw/excalidraw). Boards sync live between browsers through a Yjs CRDT, images dropped on a board are stored in S3, and AI agents read and edit boards over MCP with edits showing up live.

Scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Features

- **Boards**: Excalidraw canvas per board; create, rename, delete from the dashboard
- **Search**: the dashboard search field (`GET /api/boards/search?q=`) finds boards you own or are invited to by title, element text (shape labels included) and comment text, as a case-insensitive substring so Thai works. Element text is mirrored into `board_text` (with page ids, pg_trgm GIN index) each time a board is persisted, and boards saved before search existed are indexed on API start
- **Realtime (CRDT)**: one Yjs doc per board, `elements` map keyed by element id, merged with Excalidraw's version/versionNonce rule; presence (cursors, names) via Yjs awareness over `WS /api/boards/sync/:id`. A browser writes element edits at most every 33 ms (the cursor rate, latest scene wins), flushing the pending write on page switch, teardown and tab hide. Deleted elements stay in the doc as `isDeleted` tombstones so late joiners converge; a tombstone whose `updated` is more than a day old is removed (key delete) when the board's room next loads, and browsers treat a removed key as a deletion. The prune alone is not saved (a save would bump the board's "updated" time); the next real edit stores it
- **Local cache**: signed-in users keep each opened board in IndexedDB, so reopening paints from disk and syncs only the difference; offline edits merge on reconnect, and sign-out or lost access deletes the cache
- **Media**: images upload to S3 (`POST /api/boards/:id/files`) and stream back through the API; PNG/JPEG/WebP are re-encoded client-side to WebP (long side capped at 2048 px) before upload, GIF and SVG are stored untouched, and a page only downloads the images it shows; any S3-compatible store works (RustFS locally)
- **MCP**: `POST /mcp` (Streamable HTTP, stateless) with 32 tools, and a drawing guide sent to agents as server instructions at initialize: `list_boards`, `create_board`, `get_board`, `get_board_image`, `list_pages`, `add_page`, `rename_page`, `delete_page`, `add_elements`, `connect`, `update_element`, `delete_elements`, `get_selection`, `select`, `focus`, `get_changes`, `edit_selection`, `list_comments`, `reply_comment`, `list_replies`, `add_comment`, `resolve_comment`, `list_shared_boards`, `search_boards`, `rename_board`, `group_elements`, `ungroup_elements`, `align_elements`, `distribute_elements`, `export_scene`, `add_image`, `list_viewers`; authenticated with OAuth 2.1 or a Better Auth API key in `x-api-key`, created from the dashboard
  - **Arrow connectors**: give shapes an `id` in `add_elements` and add an `arrow`/`line` with `startElementId`/`endElementId`; it becomes a real Excalidraw binding, drawn edge to edge, re-routed when either shape moves (from MCP or by dragging in the browser), rebound or detached with `update_element`, and cleaned up on delete. `get_board` reports each connector's ends.
  - **Board image**: `get_board_image` renders a page to a PNG (MCP image block, long side `maxSize`, default 1600) so an agent can see layout and legibility; shapes, arrows, labels, text, freedraw and images are drawn simplified rather than hand-drawn, with Sarabun covering Latin and Thai. Rasterized by resvg, whose native binary and the font files in `apps/server/assets/fonts` ship in the server image.
  - **Labels and auto-layout**: `text` on a `rectangle`/`ellipse`/`diamond` becomes a bound Excalidraw label (centered, moved with the shape, edited or removed with `update_element`), and the shape grows to fit it. Leave `x`/`y` out to have the shapes laid out as a flowchart along the batch's arrows (`direction`: `down` or `right`), to the right of existing content. `get_board` lists elements bottom to top, reports a shape's label as its `text` and omits default colors.
  - **Z-order**: stacking follows Excalidraw's fractional `index`. The server gives every element it creates a key on top (a label right above its shape), and browsers sort the shared map by that key before handing it to Excalidraw, because the CRDT map iterates in client order and Excalidraw re-keys (and re-versions) anything out of order.
  - **Style fields and locking**: `add_elements`, `update_element` and `edit_selection` take `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `roundness`, `opacity`, `angle` (radians), `fontSize`/`fontFamily`/`textAlign` (text and labels), `startArrowhead`/`endArrowhead` (arrows) and `locked`, all derived from one style table. `add_elements` rejects a style field that does not apply to the element type; `update_element` and `edit_selection` drop it so mixed selections still work. A locked element refuses edits and deletes from MCP, while browsers still edit it.
  - **Arrow labels**: `text` on an `arrow` becomes a bound label at the arrow's midpoint, refitted when the arrow re-routes and deleted with it; auto-layout widens the gap so the line stays visible around the label. `endArrowhead` `null` draws no head.
  - **Frames**: `add_elements` takes `type: "frame"` with a `name`; elements with that `frameId` are its children and sit directly below it in z-order. A frame without a size wraps its children; moving a frame moves them, and a child moved fully outside leaves the frame, as in Excalidraw.
  - **Layout ops**: `group_elements`, `ungroup_elements`, `align_elements` and `distribute_elements` tidy a set of elements by id; locked elements and bound arrows are skipped and reported.
  - **`get_board` filters**: `within` (a region), `types` and `limit` (1 to 1000) narrow the reply, which adds `total` (matches before `limit`) and `truncated`.
  - **Images**: `add_image` takes base64 image bytes (PNG, JPEG, GIF, WebP or SVG, up to 700 KiB decoded, so the request stays under the 1 MiB body limit), stores them like a browser upload under the SHA-1 of the bytes and places the picture at its natural size, long side at most 800 px.
  - **Export**: `export_scene` returns the page as a `.excalidraw` file; `includeFiles` (default false) embeds the images.
  - **Guide and search**: `initialize` returns a short drawing guide as MCP `instructions` (the draw-in-steps loop, sizing, colour meaning); `search_boards` finds boards by title, element text and comments.
  - **Changes since last look**: `get_changes` called without `since` returns a cursor; passed back as `since` it lists elements people added, updated or deleted in the browser (labels folded into their shape, at most 100, the rest counted in `omitted`) plus comment activity (new threads, replies, edits, resolves; 50 per call, `moreComments`). The cursor is a pruned Yjs state vector with a comment keyset position, so it survives room unloads, restarts and other instances. Agent writes are told apart from browser writes by the `agents` map in the document, so your own edits are not reported. Edits removed by deleting a whole page, deletions whose tombstone was pruned (more than a day old), reopened or deleted comments and reactions are not reported.
  - **Focus**: `focus {boardId, ids}` selects elements like `select`, publishes their page and a fresh `reveal` number in the MCP awareness state, and browsers on the board switch page, scroll them into view and outline them. `select` also publishes the page but never asks for a reveal.
  - **Viewers**: `list_viewers` returns who has the board open in a browser right now, across server instances: signed-in people by name plus a count of anonymous share-link viewers. Each websocket connection is scored in a Redis sorted set and refreshed at most every 15 s; one silent for 60 s drops out.
- **Idempotent writes**: `POST /api/boards`, `POST /api/boards/:id/comments` and `POST .../comments/:commentId/replies` accept an `Idempotency-Key` header (1 to 255 characters). A repeat with the same key and body replays the first response for 24 h, a repeat while the first is still running gets 409, and the same key with a different body gets 422. The web app sends one key per draft.
- **Auth**: Better Auth (email/password, API keys) mounted in Elysia the way Better Auth's own Elysia integration does it, with an `auth` macro. Sessions and verification values are read from Redis with Postgres as the source of truth, and the sign-in rate limit counts in Redis so it holds across instances
- **Stack**: TanStack Start, Elysia 2 (rc), Bun, Drizzle + PostgreSQL, shadcn/ui on React Aria, Oxlint + Oxfmt (Ultracite), Turborepo, Lefthook

## Architecture

- `apps/server` follows [feature-first clean architecture](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d): `src/features/<feature>/{domain,application,infrastructure,presentation}` plus an `ioc.ts` plugin factory per feature, `src/shared/{kernel,application,infrastructure,presentation}`, `src/bootstrap/app.ts` (`createApp`, `type App`) and `src/main.ts`.
- `apps/web` follows [Feature-Sliced Design](https://feature-sliced.design): `src/{app,pages,widgets,features,entities,shared}`. `src/routes/**` stay thin and only compose pages. The API client is Eden treaty typed from the server's `App`.
- Drizzle tables live in `packages/db` so drizzle-kit and the Better Auth schema generator have one schema root.

## Guardrails (Redproof)

[Redproof](https://github.com/schalermthai/redproof) gates in `gates/` enforce the rules, and every rule has a RED proof that plants a violation and shows the gate catches it:

- `server-architecture`: dependency rule of the clean architecture (domain pure, application inward-only, presentation never imports infrastructure, features talk through `features/<f>/index.ts`)
- `web-fsd`: FSD layer order, no cross-slice imports, public API via `index.ts`, thin routes
- `typecheck`, `server-tests`, `lint`

```bash
bun run redproof         # check the tree
bun run redproof:prove   # prove each gate can fail
```

`lefthook` runs `redproof check` on pre-push.

## Getting Started

```bash
bun install
bun run services:start   # postgres + redis + S3 (RustFS) + bucket setup
bun run db:migrate
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) for the web app. The API runs at [http://localhost:3000](http://localhost:3000), OpenAPI docs at `/openapi`.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`. The visual system (intentapp.dev-derived tokens, type, components, rules) is documented in [apps/web/DESIGN.md](apps/web/DESIGN.md); product context lives in [apps/web/PRODUCT.md](apps/web/PRODUCT.md).

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@narbel/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Dokploy

Dokploy runs narbel as five services: `narbel-web`, `narbel-api`, `narbel-store` (RustFS S3), `narbel-db` (Postgres 18 alpine) and `narbel-cache` (Redis). `scripts/dokploy-provision.ts` creates and configures them through the Dokploy API. Guide and env vars: [docs/deploy-dokploy.md](docs/deploy-dokploy.md).

### Local Docker Compose

- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- `bun run docker:up`, `bun run docker:logs`, `bun run docker:down`

## Git Hooks and Formatting

- Run checks: `bun run check`

## Project Structure

```
narbel/
├── apps/
│   ├── web/         # TanStack Start, Feature-Sliced Design
│   └── server/      # Elysia 2, feature-first clean architecture
├── packages/
│   ├── ui/          # shadcn/ui (React Aria base) components and styles
│   ├── auth/        # Better Auth configuration
│   └── db/          # Drizzle schema, migrations
├── gates/           # Redproof gates and dependency-cruiser rules
└── docs/            # Dokploy guide, decision log
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run services:start`: Start postgres, redis and the local S3 store
- `bun run redproof` / `bun run redproof:prove`: Run / prove the guardrail gates
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Oxlint and Oxfmt
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## Better Auth Schema Generation

After changing auth plugins or schema options, run `bun run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from `apps/server`, loading the auth instance from `apps/server/auth.config.ts`. Review the schema changes, then run `bun run db:generate` and `bun run db:migrate`.
