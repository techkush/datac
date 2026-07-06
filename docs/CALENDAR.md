# DataC Calendar & Record-Keeping — Setup & API

A self-hosted, Google-Calendar-style module bolted onto DataC. PostgreSQL is the
system of record (via Prisma); Firebase is reserved for mobile push only (Phase
4). The web app, the future Flutter app, and any API client all talk to the same
secure HTTP API.

> **Status:** Phases 1–5 shipped — feature-complete for the web/backend.
> See [DEPLOY.md](./DEPLOY.md) for self-hosting, backups, and cloud migration,
> and [openapi.yaml](./openapi.yaml) for the machine-readable API spec.
> - **Phase 1** — foundation (Postgres + Prisma + Docker + auth) and the calendar
>   UI (day/week/month/agenda, event CRUD, categories, notes, drag-and-drop
>   reschedule).
> - **Phase 2** — recurring events (RRULE) with per-occurrence edit/delete
>   ("this event" vs "all events"), plus the reminder scheduler that dispatches
>   through a pluggable notification sender (FCM stub for now).
> - **Phase 3** — time-blocking (events flagged as reserved focus periods, shown
>   with a striped/dashed style) and a **Pomodoro** timer (default 25/5,
>   fully configurable) that records `PomodoroSession`s and rolls focused time
>   into the linked event's `actualSeconds` for reports.
> - **Phase 4** — Firebase Cloud Messaging adapter (auto-activates when a service
>   account is provided; prunes dead tokens), device-registration API, the
>   mobile **status-sync API** (single + batch), a one-call bootstrap, and a
>   web **Reports** view (status breakdown, completion rate, focus time,
>   Pomodoro counts).
> - **Phase 5** — Dockerized app image (standalone, non-root) + compose `app`/
>   `migrate` services, `/api/health`, backup/restore scripts, structured JSON
>   logging, OpenAPI spec, and the self-host→cloud deploy guide.

## Mobile / Flutter integration (Phase 4)

The Flutter app authenticates with `POST /api/auth/login` (uses the returned
`token` as a `Bearer`), then:

- **Registers for push** — `POST /api/mobile/devices` with its FCM token; the
  server stores it and targets it from the reminder scheduler. Real delivery
  activates automatically once `FCM_SERVICE_ACCOUNT(_PATH)` is set (otherwise a
  no-op stub). Invalid tokens are pruned on send.
- **Hydrates** — `GET /api/mobile/bootstrap?days=30` returns user, settings,
  categories, and upcoming events (recurrence expanded) in one call.
- **Reports status back** — `POST /api/mobile/events/:id/status` for a single
  change, or `POST /api/mobile/sync` to reconcile a batch captured offline
  (status updates, activity, completed Pomodoro sessions). All statuses
  (`NOT_STARTED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `MISSED`, `CANCELLED`)
  append `StatusHistory` (source `MOBILE`), stamp completion time, and roll
  `actualSecondsDelta` / Pomodoro focus into the event's `actualSeconds`.
  Occurrence ids (`master::ISO`) auto-materialize an override so one instance
  can carry its own status.

## Time-blocking & Pomodoro (Phase 3)

- Toggle **Time block** on any event to mark it as a reserved focus period; it
  renders with a distinct hatched/dashed style in the views.
- The **Focus** button in the toolbar opens the Pomodoro widget; the **Start
  focus** button in an event dialog runs a Pomodoro tied to that event. Durations
  (focus / short break / long break / cycles-before-long-break) are editable in
  the widget and persist to `UserSettings`.
- A session is created on start and finalized on stop; its focused seconds are
  added to the event's `actualSeconds` once (idempotent), and `ActivityLog`
  rows (`pomodoro_started` / `pomodoro_completed`) feed future reports.

## Recurring events & reminders (Phase 2)

- Give an event a `recurrenceRule` (RRULE string, e.g. `FREQ=WEEKLY`) to make it a
  series. The API expands occurrences on read within the requested window.
- Editing/deleting a single occurrence uses `?scope=occurrence` (creates an
  override / EXDATE); `?scope=all` changes the whole series. The web dialog asks
  which when you touch a recurring event; dragging an occurrence edits just it.
- Reminders (`minutesBefore`) are captured per event with a precomputed `fireAt`.
  The scheduler runs **in-process every minute** on the self-hosted server
  (`src/instrumentation.ts`). For a cloud deploy, set
  `DISABLE_IN_PROCESS_SCHEDULER=1` and drive `POST /api/calendar/scheduler/tick`
  from an external cron (authorize with `SCHEDULER_SECRET` via the
  `X-Scheduler-Secret` header). Delivery goes through the `NotificationSender`
  interface — a no-op stub today, a Firebase adapter in Phase 4.

## 1. Prerequisites

- Node.js 20+ (tested on 22)
- Docker (for the Postgres container) — or a Postgres 14+ you manage yourself

## 2. First-time setup

```bash
# 1. Environment
cp .env.example .env
#    Edit .env — at minimum set a strong POSTGRES_PASSWORD, a random JWT_SECRET
#    (openssl rand -base64 48), and your OWNER_EMAIL / OWNER_PASSWORD.
#    Keep DATABASE_URL's password in sync with POSTGRES_PASSWORD.

# 2. Start Postgres (Docker)
npm run db:up          # docker compose up -d db

# 3. Create the schema
npm run db:migrate     # prisma migrate dev  (first run creates the tables)

# 4. Seed the owner account + default categories (idempotent)
npm run db:seed

# 5. Run the app
npm run dev            # http://localhost:3000/calendar
```

Sign in at `/calendar` with the `OWNER_EMAIL` / `OWNER_PASSWORD` from `.env`.

## 3. Everyday commands

| Command | What it does |
| --- | --- |
| `npm run db:up` / `npm run db:down` | Start / stop the Postgres container |
| `npm run db:migrate` | Create & apply a new migration in dev |
| `npm run db:deploy` | Apply committed migrations (production/CI) |
| `npm run db:seed` | Ensure the owner + default categories exist |
| `npm run db:studio` | Open Prisma Studio (DB browser) |
| `npm run db:generate` | Regenerate the Prisma client |

## 4. Environment variables

See `.env.example` for the annotated template. Key groups:

- **Database** — `POSTGRES_*` seed the Docker container; `DATABASE_URL` is what
  Prisma connects with. To move to a managed cloud Postgres later, change only
  `DATABASE_URL`.
- **Auth** — `JWT_SECRET` (required), `JWT_EXPIRES_IN`, and the `OWNER_*` seed
  credentials.
- **Firebase (Phase 4)** — leave blank until the Flutter app exists; push runs
  in stub mode.
- **Server** — `PORT`, `ALLOWED_ORIGINS` (comma-separated; needed so the mobile
  app / another origin can call the API), `LOG_LEVEL`.

## 5. API summary (Phase 1)

All calendar endpoints require auth. Web clients use the httpOnly `datac_token`
cookie set at login; the mobile/API clients send `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Email+password → JWT (+ sets cookie) |
| `POST` | `/api/auth/logout` | Clear the web cookie |
| `GET` | `/api/auth/me` | Current user + settings |
| `GET` | `/api/calendar/categories` | List categories |
| `POST` | `/api/calendar/categories` | Create a category |
| `PATCH`/`DELETE` | `/api/calendar/categories/:id` | Update / delete |
| `GET` | `/api/calendar/events?from=ISO&to=ISO` | Events overlapping a range |
| `POST` | `/api/calendar/events` | Create an event (+ reminders) |
| `GET`/`PATCH`/`DELETE` | `/api/calendar/events/:id` | Read / update / delete (`:id` may be a `master::ISO` occurrence id; add `?scope=occurrence\|all`) |
| `POST` | `/api/calendar/scheduler/tick` | Run one reminder pass (user session or `X-Scheduler-Secret`) |
| `GET`/`PATCH` | `/api/calendar/settings` | Read / update settings (Pomodoro durations, week start, tz) |
| `POST` | `/api/calendar/pomodoro/sessions` | Start a Pomodoro session (optionally linked to an event) |
| `PATCH` | `/api/calendar/pomodoro/sessions/:id` | Accrue progress; `ended:true` finalizes and logs focus time |
| `GET` | `/api/calendar/reports/summary?from&to` | Aggregates for the Reports view |
| `GET`/`POST`/`DELETE` | `/api/mobile/devices` | List / register / unregister an FCM device token |
| `GET` | `/api/mobile/bootstrap?days=30` | One-call hydrate: user, settings, categories, events |
| `POST` | `/api/mobile/events/:id/status` | Report a single status change from the device |
| `POST` | `/api/mobile/sync` | Batch reconcile statuses, activity, Pomodoro sessions |

Event status changes via `PATCH` append a `StatusHistory` row and stamp
`completedAt` on `COMPLETED` — the record-keeping backbone the mobile app will
report into.

### Example

```bash
# Login (mobile-style, capture the token)
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"..."}' | jq -r .token)

# Create an event with two reminders
curl -s -X POST localhost:3000/api/calendar/events \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Design review","startsAt":"2026-07-08T14:00:00Z",
       "endsAt":"2026-07-08T15:00:00Z","reminders":[{"minutesBefore":15},{"minutesBefore":0}]}'
```

## 6. Backups (quick reference)

```bash
# Dump
docker exec -t datac-postgres pg_dump -U datac datac > backup_$(date +%F).sql
# Restore
cat backup_YYYY-MM-DD.sql | docker exec -i datac-postgres psql -U datac datac
```

Persistent data lives in the `datac_pgdata` Docker volume. Fuller backup,
logging, and cloud-migration guidance arrives with Phase 5.

## 7. Data model (high level)

`User` · `UserSettings` · `Device` · `Category` · `Event`
(`RecurrenceException`, `Reminder`) · `StatusHistory` · `PomodoroSession` ·
`ActivityLog`. The full, commented schema is in `prisma/schema.prisma`; it is
designed so every later phase adds rows/relations without breaking migrations.
