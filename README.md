# narbel

Collaborative whiteboard. Signed-in users own boards drawn with [Excalidraw](https://github.com/excalidraw/excalidraw). Boards sync live between browsers through a Yjs CRDT, images dropped on a board are stored in S3, and AI agents read and edit boards over MCP with edits showing up live.

Scaffolded with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack).

## Features

- **Boards**: Excalidraw canvas per board; create, rename, delete from the dashboard
- **Realtime (CRDT)**: one Yjs doc per board, `elements` map keyed by element id, merged with Excalidraw's version/versionNonce rule; presence (cursors, names) via Yjs awareness over `WS /api/boards/sync/:id`
- **Media**: images upload to S3 (`POST /api/boards/:id/files`) and stream back through the API; any S3-compatible store works (RustFS locally)
- **MCP**: `POST /mcp` (Streamable HTTP, stateless) with tools `list_boards`, `create_board`, `get_board`, `add_elements`, `update_element`, `delete_elements`; authenticated with a Better Auth API key in `x-api-key`, created from the dashboard
- **Auth**: Better Auth (email/password, API keys) mounted in Elysia the way Better Auth's own Elysia integration does it, with an `auth` macro
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
