# Deploying narbel on Dokploy

Narbel runs on Dokploy as five services in the `narbel` project:

| Service | Kind | What it runs | Domain (https) |
| --- | --- | --- | --- |
| `narbel-web` | Application (git, Dockerfile `apps/web/Dockerfile`, stage `runner`) | TanStack Start web app | `<BASE_DOMAIN>` → 3001 |
| `narbel-api` | Application (git, Dockerfile `apps/server/Dockerfile`, stage `runner`) | Elysia API, websockets (`/api/boards/sync/:id`), MCP (`/mcp`) | `api.<BASE_DOMAIN>` → 3000 |
| `narbel-store` | Application (Docker image `rustfs/rustfs`, volume `narbel-store-data` on `/data`) | S3-compatible object store for board images | `store.<BASE_DOMAIN>` → 9000 |
| `narbel-db` | Postgres (`postgres:18-alpine`) | database | internal only |
| `narbel-cache` | Redis (`redis:7-alpine`; 7+ required for `EXPIRE ... NX`) | cache-aside, cross-instance websocket fan-out, Better Auth session read path and login rate-limit counters, boot job lock | internal only |

Current deployment: `BASE_DOMAIN=narbel.84-247-158-105.sslip.io` (sslip.io resolves the name to the embedded IP, so no DNS records are needed). Domains go through Dokploy's Traefik with Let's Encrypt certificates; no service publishes a host port.

Services reach each other on `dokploy-network` by their Dokploy app names (for example `narbel-db-exn7k3`). The store has a public domain because browsers upload straight to it through presigned URLs.

## Provisioning

`scripts/dokploy-provision.ts` creates and configures everything through the Dokploy API and is safe to rerun. It keeps generated secrets and service ids in `.dokploy-state.json` (gitignored).

```bash
DOKPLOY_URL=http://<dokploy-host>:3000 \
DOKPLOY_API_KEY=<dokploy api key> \
RESEND_API_KEY=<resend key> \
BASE_DOMAIN=<domain whose name, api. and store. subdomains point at the server> \
bun scripts/dokploy-provision.ts <environmentId> <sshKeyId>
```

- `environmentId`: the `production` environment of the `narbel` project.
- `sshKeyId`: a Dokploy SSH key whose public half is a read-only deploy key on the GitHub repo.
- `BRANCH` (optional, default `rebuild`): the git branch to build.

The script also creates the `narbel` bucket and its CORS rule for the web origin (needs Docker locally for `aws-cli`). To move to your own domain, add A records for `<domain>`, `api.<domain>` and `store.<domain>`, rerun the script with the new `BASE_DOMAIN`, and delete the old domains in Dokploy.

## Environment

`narbel-api`: `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public API URL), `CORS_ORIGIN` and `WEB_ORIGIN` (public web URL), `S3_ENDPOINT` (public store URL), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `RESEND_FROM`. The image sets `MIGRATIONS_DIR`, so the API applies pending Drizzle migrations on every start.

`narbel-web`: build arg `VITE_SERVER_URL` (public API URL), runtime `SERVER_URL` (internal API URL for SSR).

`narbel-store`: `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY` (same pair as the API's S3 keys).

## Cookies

With https URLs the session cookie is `SameSite=None; Secure`. If `BETTER_AUTH_URL` is plain http (an IP and port setup) it falls back to `SameSite=Lax` without `Secure`, which only works when web and API share a site.

## Redeploying

Pushing to the deploy branch does not trigger a build (the services use a custom git URL with an SSH key, so GitHub webhooks are not wired). After pushing, redeploy `narbel-api` and/or `narbel-web` from the Dokploy UI or with `POST /api/application.deploy {"applicationId": ...}`. The API applies pending migrations on start.

## MCP

Point an MCP client at `<api>/mcp`. OAuth clients sign in on their own: the 401 carries a `WWW-Authenticate` header, the client registers at `<api>/api/auth/oauth2/register`, and the user approves on `<web>/consent`. This needs `BETTER_AUTH_URL` and `CORS_ORIGIN` to be the public API and web origins, and `<api>/.well-known/*` must reach the API. For clients without OAuth, create an API key on the dashboard ("MCP access") and send it as `x-api-key: <key>`.
