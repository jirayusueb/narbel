# Deploying narbel on Dokploy

Stack: `docker-compose.dokploy.yml` runs `postgres`, a one-shot `migrate`, `server` (Elysia, port 3000) and `web` (TanStack Start, port 3001). S3 storage is external.

## Prerequisites

- A Dokploy instance and two DNS names pointing at it, for example `app.example.com` (web) and `api.example.com` (server).
- An S3-compatible bucket (AWS S3, or the Dokploy MinIO template). Create the bucket first.
- Drizzle migrations committed under `packages/db/src/migrations`. Generate them locally with `bun run db:generate` if the folder is empty. The `migrate` service only applies existing migration files.

## Environment variables

Set these in the service's **Environment** tab. Compose fails fast if a required one is missing.

| Variable | Required | Example / meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Random password for the bundled Postgres. Pick once. Changing it later does not change the existing volume. |
| `BETTER_AUTH_SECRET` | yes | 32+ random chars (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | yes | Public API origin, `https://api.example.com`. |
| `CORS_ORIGIN` | yes | Public web origin, `https://app.example.com`. |
| `VITE_SERVER_URL` | yes | Public API origin, `https://api.example.com`. Baked into the web bundle at build time, so changing it needs a rebuild. |
| `S3_ENDPOINT` | yes | `https://s3.example.com` (full URL with scheme). |
| `S3_REGION` | no | Defaults to `us-east-1`. |
| `S3_BUCKET` | yes | Bucket name, e.g. `narbel`. |
| `S3_ACCESS_KEY_ID` | yes | Access key. |
| `S3_SECRET_ACCESS_KEY` | yes | Secret key. |
| `RESEND_API_KEY` | yes | Resend API key, used for board invite emails. |
| `RESEND_FROM` | no | Sender, defaults to `Narbel <onboarding@resend.dev>`. Use a verified domain to mail anyone. |
| `WEB_ORIGIN` | no | Public web origin used in invite and share links. Defaults to `CORS_ORIGIN`. |

`DATABASE_URL` and `SERVER_URL` are set inside the compose file. Do not add them.

## Steps

1. In Dokploy create a project, then **Create Service -> Compose**. Type: **Docker Compose**.
2. Source: your Git provider, repository and branch. **Compose Path**: `./docker-compose.dokploy.yml`.
3. Paste the variables above into the **Environment** tab and save.
4. **Domains** tab, add two domains with HTTPS on and a Let's Encrypt certificate:
   - `app.example.com` -> service `web`, port `3001`
   - `api.example.com` -> service `server`, port `3000`
5. Click **Deploy**. Order is: postgres healthy, `migrate` exits 0, `server` healthy, `web` starts. Build logs are in the **Deployments** tab.
6. Open `https://app.example.com`, sign up, create a board.

## Notes

- **HTTPS is required.** Web and API sit on different subdomains, so the session cookie is cross-site and browsers only send secure cookies over HTTPS. `BETTER_AUTH_URL`, `CORS_ORIGIN` and `VITE_SERVER_URL` must all use `https://`, with no trailing slash.
- **WebSockets.** Realtime sync uses `wss://api.example.com/api/boards/sync/:id`. Traefik proxies upgrades with no extra configuration. If sync fails behind another proxy or CDN in front of Traefik (e.g. Cloudflare), make sure WebSockets are enabled there.
- **Images.** The browser uploads straight to S3 through a presigned PUT URL and the server streams images back after an access check, so `S3_ENDPOINT` must be reachable from the user's browser and the bucket must allow cross-origin PUT from the web origin.
- **Redeploys** rerun `migrate` first; it is a no-op when nothing changed. Data lives in the `narbel_postgres_data` volume.

## MCP for AI agents

1. Sign in to the web app. Create an API key with the better-auth API key plugin on the API origin, e.g. from the browser console on the app:
   ```js
   await fetch("https://api.example.com/api/auth/api-key/create", {
     method: "POST",
     credentials: "include",
     headers: { "content-type": "application/json" },
     body: JSON.stringify({ name: "mcp" }),
   }).then((r) => r.json());
   ```
   Copy the returned `key`. It is shown once.
2. Point an MCP client at `https://api.example.com/mcp` (Streamable HTTP) with header `x-api-key: <key>`. For Claude Code:
   ```sh
   claude mcp add --transport http narbel https://api.example.com/mcp --header "x-api-key: <key>"
   ```
3. Tools: `list_boards`, `create_board`, `get_board`, `list_pages`, `add_page`, `rename_page`, `delete_page`, `add_elements`, `update_element`, `delete_elements`, `get_selection`, `select`, `edit_selection`. Edits show up live in open browsers.
