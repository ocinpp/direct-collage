# DirectCollage

Photo-booth-style UGC collage platform for events. Attendees scan a QR code, arrange photos into a collage template, the browser "bakes" them into a single composite, an admin moderates, and approved composites appear on a live media wall.

See [`PRD.md`](./PRD.md) for the full product spec.

## Monorepo layout

```
direct-collage/
  shared/       # Shared TS types + template definitions (no runtime)
  server/       # Express + Prisma (SQLite) + SSE
  submission/   # Vue 3 mobile submission portal
  admin/        # Vue 3 admin dashboard
  wall/         # Vue 3 media wall widget
```

## Prerequisites

- Node.js **>= 16.14** (18+ recommended)
- npm 8+

## Getting started

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create the SQLite DB, run migrations, and seed admin + demo wall
npm run db:reset    # = migrate + seed (resets dev.db)

# 3. Start everything (server + all 3 frontends)
npm run dev
```

Apps then run at:

| App         | URL                       |
| ----------- | ------------------------- |
| Server API  | http://localhost:4000     |
| Submission  | http://localhost:5173     |
| Admin       | http://localhost:5174     |
| Wall        | http://localhost:5175     |

> For the mobile submission flow on a real phone, you'll need to expose the
> server over your LAN (set `VITE_API_URL` in `submission/.env`) or use a
> tunnel (e.g. `ngrok`). The demo wall slug is seeded as `demo`.

## Default admin (seeded)

```
email:    admin@demo.local
password: changeme
```

Change these in `server/prisma/seed.ts` before any real use.

## Development scripts

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Run all workspaces concurrently              |
| `npm run dev:server`   | Server only                                  |
| `npm run dev:admin`    | Admin dashboard only                         |
| `npm run dev:wall`     | Media wall only                              |
| `npm run build`        | Build all workspaces                         |
| `npm run db:migrate`   | Apply Prisma migrations                      |
| `npm run db:seed`      | Seed admin + demo wall                       |
| `npm run db:reset`     | Drop & recreate DB, migrate, seed            |
