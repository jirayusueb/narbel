FROM oven/bun:1.4.4-alpine AS base
WORKDIR /app

# Reduces the workspace to web and its workspace deps, so unrelated edits keep the install layer cached.
FROM base AS builder
COPY . .
RUN bunx turbo@^2.11.7 prune web --docker

FROM base AS installer
COPY --from=builder /app/out/json/ .
# Root postinstall codegens every app by path, and the prune drops some of them.
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --ignore-scripts
COPY --from=builder /app/out/full/ .
WORKDIR /app/apps/web

# Public API origin, baked into the client bundle.
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
ENV NODE_ENV=production
RUN bun run env:generate && bun run build

FROM base AS runner
ENV NODE_ENV=production
# SSR chunks createRequire("react") and friends from apps/web/node_modules at runtime.
COPY --from=builder /app/out/json/ .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production --ignore-scripts
COPY --from=installer /app/apps/web/.output apps/web/.output
# varlock's SSR auto-load reads the schema from the working directory.
COPY --from=builder /app/out/full/apps/web/.env.schema apps/web/

ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/web
CMD ["bun", ".output/server/index.mjs"]
