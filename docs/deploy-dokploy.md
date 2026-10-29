# Deploying narbel on Dokploy

Narbel runs on Dokploy as five services in the `narbel` project:

| Service | Kind | What it runs | Published port |
| --- | --- | --- | --- |
| `narbel-web` | Application (git, Dockerfile `apps/web/Dockerfile`, stage `runner`) | TanStack Start web app | 4001 → 3001 |
| `narbel-api` | Application (git, Dockerfile `apps/server/Dockerfile`, stage `runner`) | Elysia API, websockets (`/api/boards/sync/:id`), MCP (`/mcp`) | 4000 → 3000 |
| `narbel-store` | Application (Docker image `rustfs/rustfs`, volume `narbel-store-data` on `/data`) | S3-compatible object store for board images | 4002 → 9000 |
| `narbel-db` | Postgres (`postgres:18-alpine`) | database | internal only |
| `narbel-cache` | Redis (`redis:7-alpine`) | cache-aside and cross-instance websocket fan-out | internal only |

Services reach each other on `dokploy-network` by their Dokploy app names (for example `narbel-db-exn7k3`). The store is published because browsers upload straight to it through presigned URLs.

## Provisioning

`scripts/dokploy-provision.ts` creates and configures everything through the Dokploy API and is safe to rerun. It keeps generated secrets and service ids in `.dokploy-state.json` (gitignored).

```bash
DOKPLOY_URL=http://<dokploy-host>:3000 \
DOKPLOY_API_KEY=<dokploy api key> \
RESEND_API_KEY=<resend key> \
bun scripts/dokploy-provision.ts <environmentId> <sshKeyId>
```

- `environmentId`: the `production` environment of the `narbel` project.
- `sshKeyId`: a Dokploy SSH key whose public half is a read-only deploy key on the GitHub repo.
- `BRANCH` (optional, default `rebuild`): the git branch to build.

The script also creates the `narbel` bucket and its CORS rule (needs Docker locally for `aws-cli`).

## Environment

`narbel-api`: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public API URL), `CORS_ORIGIN` and `WEB_ORIGIN` (public web URL), `S3_ENDPOINT` (public store URL), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `RESEND_FROM`. The image sets `MIGRATIONS_DIR`, so the API applies pending Drizzle migrations on every start.

`narbel-web`: build arg `VITE_SERVER_URL` (public API URL), runtime `SERVER_URL` (internal API URL for SSR).

`narbel-store`: `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` (same pair as the API's S3 keys).

## Cookies and domains

Over plain http (IP and ports) web and API are the same site, so the session cookie is `SameSite=Lax` without `Secure`. When `BETTER_AUTH_URL` is https the cookie switches to `SameSite=None; Secure`, which cross-site https domains need. To move to domains, add them in Dokploy for `narbel-web` (port 3001), `narbel-api` (port 3000) and `narbel-store` (port 9000), then rerun the script after changing `HOST`/URLs in it, and redeploy `narbel-web` (the API URL is baked in at build time).

## MCP

Create an API key on the dashboard ("MCP access"), then point an MCP client at `POST <api>/mcp` with header `x-api-key: <key>`.
