FROM oven/bun:1 AS builder
WORKDIR /app

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN cd apps/server && bun run build

# One-shot: applies packages/db migrations. Needs the full workspace for drizzle-kit.
FROM builder AS migrate
WORKDIR /app/packages/db
CMD ["bun", "run", "db:migrate:deploy"]

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "run", "start"]
