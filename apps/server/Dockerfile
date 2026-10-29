FROM oven/bun:1.4.4-alpine AS base
WORKDIR /app

# Reduces the workspace to server and its @narbel/* deps, so unrelated edits keep the install layer cached.
FROM base AS builder
COPY . .
RUN bunx turbo@^2.11.7 prune server --docker

FROM base AS installer
COPY --from=builder /app/out/json/ .
# Root postinstall codegens apps/web too, which the prune drops.
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts
COPY --from=builder /app/out/full/ .
WORKDIR /app/apps/server
ENV NODE_ENV=production
RUN bun run env:generate && bun run build

# One-shot: applies packages/db migrations. Needs the dev dependencies for drizzle-kit.
FROM installer AS migrate
WORKDIR /app/packages/db
CMD ["bun", "run", "db:migrate:deploy"]

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production --ignore-scripts
COPY --from=installer /app/apps/server/dist apps/server/dist
# varlock/auto-load validates process env against the schema at startup.
COPY --from=builder /app/out/full/apps/server/.env.schema apps/server/

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "run", "start"]
