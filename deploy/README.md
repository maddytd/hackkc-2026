# Deploy Larple on one Docker server

This package runs the React website, FastAPI API, and Gemini worker together. Caddy serves the website, routes `/api/*` to FastAPI, and manages HTTPS for your domain. SQLite, private recordings, and certificates live in named Docker volumes and survive container rebuilds.

Use one Linux server with Docker Engine and the Docker Compose plugin. Keep one API and one worker on that server. SQLite requires local persistent storage; do not spread these containers across machines or put their data on a network filesystem.

## First deployment

1. Copy this project to the server (or clone a repository containing these deployment changes).
2. Point your domain's A record at the server's public IPv4 address. Only add an AAAA record if IPv6 also reaches the server. Allow inbound TCP ports **80 and 443**.
3. From the project root, create the private configuration:

   ```sh
   cp deploy/.env.example deploy/.env
   chmod 600 deploy/.env
   ```

4. Edit `deploy/.env` on the server:

   - `SITE_ADDRESS`: your domain, e.g. `play.example.com` (no path).
   - `LARP_GEMINI_API_KEY`: your Gemini API key.
   - `LARP_GEMINI_MODEL`: a video-capable model available to that key. The tested local configuration uses `gemini-3.8-flash`.
   - `LARP_INVITE_CODE`: a new private registration code; share it with invited players.
   - `LARP_MAX_DAILY_JOBS`: your daily accepted-video limit. Each job permits up to three model calls; this is not a dollar spending limit.

   `.env.example` stays a blank, shareable template. `deploy/.env` is gitignored. Compose reads the private file at runtime; neither image contains it. Keep the existing local `backend/.env` for local development; this deployment uses `deploy/.env` instead.

5. Start the deployment:

   ```sh
   docker compose --env-file deploy/.env -f compose.production.yaml up --build -d --wait
   ```

6. Open `https://YOUR_DOMAIN`, create an account with the invite code, accept AI processing, allow camera/microphone access, and submit an answer. HTTPS is required for remote browser camera access. Verify that real feedback appears and the result is not marked DEMO.

Caddy requests and renews certificates automatically once DNS and network access are correct. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https). The API is only available through the proxy; port 8000 is not published. API and frontend share an origin, so no production CORS allowlist or frontend URL rebuild is necessary.

## Check operation

```sh
docker compose --env-file deploy/.env -f compose.production.yaml ps
docker compose --env-file deploy/.env -f compose.production.yaml logs --tail=100 api worker web
curl https://YOUR_DOMAIN/api/health
```

The health endpoint confirms the API process and judging mode. It does **not** prove that the worker, Gemini key, quota, or model is working; the first real submitted video verifies that path. Provider failures retry automatically, then show a failure rather than an invented score.

## Updates and shutdown

After copying or pulling updated source, run the same `up --build -d --wait` command. Rebuilds keep the data volumes. Changing the model or judging mode after a day's first attempt conflicts with the saved daily challenge; keep that configuration stable during a competition day.

To stop the deployment while retaining data:

```sh
docker compose --env-file deploy/.env -f compose.production.yaml down
```

Do not add `--volumes` / `-v` to a production shutdown: that deletes players, scores, and stored recordings, as well as certificates.

## Back up and restore

Backups include private recordings and authentication records. Store them privately. Stop writers while taking a consistent backup of the whole game volume:

```sh
umask 077
docker compose --env-file deploy/.env -f compose.production.yaml stop api worker
docker compose --env-file deploy/.env -f compose.production.yaml run --rm --no-deps --entrypoint tar api -C /data -czf - . > larple-data-backup.tar.gz
docker compose --env-file deploy/.env -f compose.production.yaml up -d --wait
```

If the backup fails, restart the services and discard the incomplete archive. Before restoring, stop the API and worker. Restore only into an empty game volume, then start the services:

```sh
docker compose --env-file deploy/.env -f compose.production.yaml run --rm --no-deps -T --entrypoint tar api -C /data -xzf - < larple-data-backup.tar.gz
docker compose --env-file deploy/.env -f compose.production.yaml up -d --wait
```

Keep the private deployment configuration separately; it is not in the game-data backup. Keep the same Compose project name (`larple` by default) when updating so Compose reuses the existing volumes.

## Test the package locally without AI charges

With Docker running and Python 3 available:

```sh
./scripts/smoke_deployment.sh
```

This builds all images and creates an isolated project on `127.0.0.1:18080`. It checks the built frontend, same-origin API routing, invite validation, a synthetic video upload, worker scoring in demo mode, and data persistence after a restart. It removes only its own temporary containers and volumes afterward. The same test runs in GitHub Actions. It does not test public DNS, certificate issuance, or paid Gemini scoring.

For a temporary manual Docker preview, copy the example to a separate private environment file, use `SITE_ADDRESS=:80`, `HTTP_BIND=127.0.0.1`, `HTTP_PORT=18080`, `HTTPS_BIND=127.0.0.1`, and `HTTPS_PORT=18443`, then start with a distinct Compose project name. Use a real Gemini key for real judging. Use a separate project/volume if switching to demo mode, since a competition day's judging mode is immutable.

## Current scope

This is a single-server, invite-only hackathon deployment. Accounts have no password recovery. The invitation code is not proof of one person per account. Set a Gemini provider-side quota or billing budget in addition to the application's job cap. Registration and state-changing requests are rate-limited by the API; a production edge service can add broader traffic protection if the event requires it.


## Free temporary public preview from your own computer

A Cloudflare Quick Tunnel can provide a public HTTPS URL without buying hosting or a domain. The app still runs on your computer: keep it awake with Docker running. This is a temporary hackathon preview, not always-on hosting. The URL changes when the tunnel restarts. Quick Tunnels have no uptime guarantee and a 200 concurrent request limit; see [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Copy `deploy/.env.preview.example` to `deploy/.env` instead of the production example, then fill in your Gemini key and a private invite code. Use a Free tier Gemini project if you require $0 API usage; free quota exhaustion causes scoring requests to fail. The application's job cap does not determine Google's billing tier.

```sh
docker compose -p larple-preview --env-file deploy/.env -f compose.production.yaml -f compose.preview.yaml up --build -d --wait
docker compose -p larple-preview --env-file deploy/.env -f compose.production.yaml -f compose.preview.yaml logs tunnel
```

The tunnel log prints an `https://...trycloudflare.com` address. Share that address and the invite code with players. Use the same project name and files for updates, and stop the public preview with:

```sh
docker compose -p larple-preview --env-file deploy/.env -f compose.production.yaml -f compose.preview.yaml down
```

Accounts and scores remain in this preview project's volume. It is separate from your local development database. All preview users share the proxy's authentication rate-limit bucket, so stagger signups if you reach the 10-per-minute limit.
