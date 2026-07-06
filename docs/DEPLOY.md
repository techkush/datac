# DataC Calendar — Self-hosting, Ops & Migration Guide

This covers running the calendar server on your own machine (an old PC is fine),
keeping it healthy, backing it up, and moving it to the cloud later. For the
feature overview and API reference see [CALENDAR.md](./CALENDAR.md) and
[openapi.yaml](./openapi.yaml).

## 1. Two ways to run

### A. Database in Docker, app on the host (simplest for dev)
```bash
cp .env.example .env          # fill in secrets
npm install
npm run db:up                 # Postgres in Docker
npm run db:migrate            # create schema
npm run db:seed               # owner + default categories
npm run dev                   # http://localhost:3000/calendar
```

### B. Everything in Docker (recommended for a self-hosted box)
```bash
cp .env.example .env          # fill in secrets (POSTGRES_PASSWORD, JWT_SECRET, OWNER_*)
docker compose run --rm migrate     # apply migrations
docker compose up -d db app         # Postgres + web/API server
docker compose run --rm app node --import tsx prisma/seed.ts   # first-time seed
# App: http://localhost:4321/calendar
```
The image is a Next.js **standalone** build (small runtime, non-root user). The
`app` service's `DATABASE_URL` points at the `db` service; the host-oriented
value in `.env` is only used when running on the host.

Rebuild after code changes: `docker compose build app && docker compose up -d app`.

## 2. Health & logging

- **Health check:** `GET /api/health` → `{ "status": "ok", "db": "up" }` (503 if
  the DB is unreachable). Wired into the compose healthcheck and suitable for any
  uptime monitor.
- **Logs:** the app emits **structured single-line JSON** to stdout (level, msg,
  context, timestamp). `LOG_LEVEL` = `debug|info|warn|error`.
  - Docker: `docker compose logs -f app`
  - Ship to a file/service later with no code change (stdout is the contract).
- **Errors:** all API routes run through one handler that returns typed JSON
  errors (`401/404/409/422/500`) and logs unhandled 500s with a stack.

## 3. The reminder scheduler

Runs **in-process every minute** by default (started from
`src/instrumentation.ts`). Two operational modes:

- **Self-hosted (default):** leave `DISABLE_IN_PROCESS_SCHEDULER` unset.
- **Cloud / multi-instance:** set `DISABLE_IN_PROCESS_SCHEDULER=1` and drive
  `POST /api/calendar/scheduler/tick` from an external cron, authorized with the
  `X-Scheduler-Secret` header (`SCHEDULER_SECRET` env). This avoids duplicate
  sends when running more than one app instance.

## 4. Push notifications (FCM)

Delivery is a no-op **stub** until you provide Firebase credentials, then it
activates automatically — no code change:

1. Firebase Console → Project settings → Service accounts → *Generate new private
   key* (downloads a JSON).
2. Set `FCM_SERVICE_ACCOUNT_PATH=/path/to/key.json` (or inline the JSON in
   `FCM_SERVICE_ACCOUNT`) and restart.
3. The Flutter app registers its device token via `POST /api/mobile/devices`.

Dead/uninstalled tokens are pruned automatically on send.

## 5. Backups

```bash
./scripts/backup.sh backups           # -> backups/datac_YYYYMMDD_HHMMSS.sql.gz
./scripts/restore.sh backups/datac_XXXX.sql.gz   # overwrites current DB (confirms first)
```
- Backups are gzipped `pg_dump`s; the script keeps the newest 14
  (`DATAC_BACKUP_KEEP` to change).
- **Automate with cron** (daily at 02:00):
  ```cron
  0 2 * * * cd /path/to/datac && ./scripts/backup.sh backups >> backups/backup.log 2>&1
  ```
- Data lives in the Docker volume `datac_pgdata`. Do **not** run
  `docker compose down -v` unless you intend to delete it. Copy backups off-box
  (another disk / cloud storage) for real durability.

## 6. Database migrations

- Create a migration during development: `npm run db:migrate` (writes to
  `prisma/migrations/`, commit these).
- Apply committed migrations in production: `npm run db:deploy`
  (or `docker compose run --rm migrate`).
- Migrations are forward-only history; never edit an applied migration — add a
  new one.

## 7. Moving to the cloud later

The design keeps this a small lift:

- **Database:** point `DATABASE_URL` at a managed Postgres (RDS, Cloud SQL,
  Neon, Supabase). Run `npm run db:deploy`. No code changes.
- **App:** the same Docker image runs on any container host (Fly.io, Render,
  Cloud Run, a VPS). Set the env vars; expose port 4321.
- **Scheduler:** set `DISABLE_IN_PROCESS_SCHEDULER=1` and add a platform cron
  hitting `/api/calendar/scheduler/tick` with `SCHEDULER_SECRET` — correct for
  horizontally-scaled deployments.
- **Secrets:** move `.env` values into the platform's secret manager.
- **CORS:** set `ALLOWED_ORIGINS` to the web/mobile origins that call the API.

Nothing in the app assumes localhost or the filesystem for calendar data — it's
all Postgres behind Prisma.

## 8. Security checklist before exposing publicly

- [ ] Strong `POSTGRES_PASSWORD` and a long random `JWT_SECRET` (`openssl rand -base64 48`)
- [ ] Terminate TLS in front (reverse proxy: Caddy/nginx/Traefik) — cookies are
      marked `secure` in production
- [ ] Set `ALLOWED_ORIGINS` explicitly (don't use `*` with credentials)
- [ ] Keep Postgres bound to localhost / private network (compose already binds
      `127.0.0.1`)
- [ ] Back up off-box and test a restore
