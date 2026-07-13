# DirectCollage

Photo-booth-style UGC collage platform for events. Attendees scan a QR code, pick a collage layout, arrange their photos, and the browser "bakes" them into a single composite. An admin moderates submissions, and approved composites appear on a live media wall in real time.

See [`PRD.md`](./PRD.md) for the full product spec (v2.6).

## How it works

```
Phone (submission)          Server (API)              Admin (moderation)        Wall (display)
┌─────────────┐   submit    ┌─────────────┐  approve   ┌─────────────┐   SSE    ┌─────────────┐
│ pick layout │ ──────────► │  validate   │ ◄────────► │  queue      │ ───────► │ live grid   │
│ upload      │   composite │  (sharp)    │            │  approve/   │  push    │ (responsive)│
│ crop/zoom   │             │  store      │            │  reject     │          │             │
│ bake → JPEG │             │  SQLite     │            │             │          │             │
└─────────────┘             └─────────────┘            └─────────────┘          └─────────────┘
```

The browser does all image processing client-side (EXIF correction, downsampling, crop/zoom, canvas baking). The server only ever sees the final composite JPEG — never original photos.

## Monorepo layout

```
direct-collage/
  shared/         TS types + template geometry (7 layouts, no runtime)
  server/         Express + Prisma/SQLite(WAL) + sharp validation + SSE + JWT auth
  submission/     Vue 3 mobile portal — template picker, photo editor, canvas baker
  admin/          Vue 3 dashboard — login, moderation queue, wall title editor
  wall/           Vue 3 media wall — SSE realtime, responsive grid, wall title
```

## Features

### Submission portal (mobile)
- **7 collage layouts**: Solo, Triad (Top-Big / Row / Columns), Quad, Pentagon (Top-Big / Row)
- **Full-screen slot editor**: tap a slot → large crop/zoom/pan surface with a dimmed "full photo" preview + bright crop frame showing exactly what will appear
- **Pinch-to-zoom + drag-to-pan** with anti-pixelation zoom clamping (PRD §6.1.4) and pan-cover clamping (no black edges)
- **EXIF orientation correction** + source downsampling before editing (prevents mobile crashes)
- **WYSIWYG baking**: the preview canvas uses the same `drawSlot` math as the baker — what you see is what gets uploaded
- **Retro Photobooth aesthetic**: cream paper background, film grain, bold display type (Archivo Black), stamp-style hard-edged buttons

### Admin dashboard
- JWT-cookie authentication (seeded admin account)
- Moderation queue with 5-second polling for new submissions
- One-click **Approve** (pushes to wall via SSE) / **Reject** (soft-delete: file removed, row kept for analytics)
- Wall **title editor** (displayed at the top of the media wall)

### Media wall
- **SSE (Server-Sent Events)** realtime — approved composites appear instantly, no refresh
- Responsive square-cell grid (1 / 3 / 5 columns)
- Wall title header (configured in admin)
- Live/reconnecting connection indicator

## Prerequisites

- **Node.js >= 20** (developed and tested on Node 24)
- **npm >= 10**

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

## Default admin (seeded)

```
email:    admin@demo.local
password: changeme
```

Change these in `server/prisma/seed.ts` before any real use.

## Testing on a phone

The dev servers bind to `0.0.0.0`, so you can access them from a phone on the same Wi-Fi.

1. Find your Mac's LAN IP:
   ```bash
   ipconfig getifaddr en0
   ```
2. Set it in `server/.env` (so the server emits reachable image URLs):
   ```env
   PUBLIC_BASE_URL=http://<your-lan-ip>:4000
   ```
3. Restart the server: `npm run dev:server`
4. Open `http://<your-lan-ip>:5173/demo` on your phone

> **DHCP note:** if your phone suddenly can't connect, your Mac's IP likely changed. Re-run `ipconfig getifaddr en0`, update `PUBLIC_BASE_URL`, and restart the server.

## Development scripts

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Run all workspaces concurrently              |
| `npm run dev:server`   | Server only                                  |
| `npm run dev:submission` | Submission portal only                      |
| `npm run dev:admin`    | Admin dashboard only                         |
| `npm run dev:wall`     | Media wall only                              |
| `npm run build`        | Build all workspaces                         |
| `npm run db:migrate`   | Apply Prisma migrations                      |
| `npm run db:seed`      | Seed admin + demo wall                       |
| `npm run db:reset`     | Drop & recreate DB, migrate, seed            |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API) + Vite + Tailwind CSS v4 |
| Fonts | Archivo Black + Inter + JetBrains Mono (self-hosted via Fontsource) |
| Backend | Node.js / Express |
| Database | SQLite (WAL mode) via Prisma |
| Storage | Local filesystem (`server/uploads/`) via a swappable `StorageAdapter` |
| Realtime | SSE (Server-Sent Events) |
| Auth | JWT in httpOnly cookie |
| Image processing | Client-side: blueimp-load-image + Canvas. Server-side: sharp (validation only) |

## Architecture notes

- **SQLite for the MVP** — the DB stores only metadata (walls, composites, status). Images go to disk. Prisma keeps the schema portable; switching to PostgreSQL is a one-line `provider` change.
- **SSE, not Socket.io** — the wall only receives pushes (one-way), so SSE is simpler and lighter. `EventSource` auto-reconnects natively and handles cross-origin for the embeddable widget.
- **Client-side baking** — the browser merges all arranged photos into a single composite JPEG via Canvas. The server validates (never trusts) the result with sharp: MIME, decodability, dimensions, aspect ratio, file size.
- **No original photo storage** — protects privacy and reduces storage cost. Only the final composite is uploaded.

## Production

The simplest production deploy is **same-origin**: the Express server serves the API + all three built frontends from a single port.

```bash
npm run build                    # builds shared → server → submission → admin → wall
node server/dist/index.js        # serves everything on :4000
```

| App         | URL                       |
| ----------- | ------------------------- |
| API         | `http://<host>:4000/api`  |
| Submission  | `http://<host>:4000/submit/demo` |
| Admin       | `http://<host>:4000/admin-ui/login` |
| Wall        | `http://<host>:4000/wall-ui/demo` |

The built frontends use `VITE_API_URL=""` (same-origin), so no additional env config is needed when served this way.

### Split-origin deploy (optional)

If you want to serve the frontends from a different host/CDN, set `VITE_API_URL` at **build time** (via a `.env.production` file in each app, or inline):

```env
# e.g. submission/.env.production
VITE_API_URL=https://api.your-domain.com
```

Then rebuild — the apps will call the API at that origin. The server's `CORS_ORIGIN` env must include the frontend origin(s).

### Environment variables (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Server port |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Base URL for composite image URLs (set to LAN IP for phone testing, or your domain in prod) |
| `JWT_SECRET` | `dev-only-change-me` | **Change in production** — signs admin session tokens |
| `CORS_ORIGIN` | `localhost:5173,5174,5175` | Comma-separated allowlist of frontend origins |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window for submissions |
| `RATE_LIMIT_MAX` | `20` | Max submissions per IP per window |
| `MAX_UPLOAD_BYTES` | `3145728` | Max composite file size (3MB) |

## Security

- **Rate limiting** on `POST /api/submit/:wallSlug` — 20 requests/minute/IP (configurable). Runs before multer decodes the upload, so floods don't hold buffer memory.
- **CORS allowlist** — only origins in `CORS_ORIGIN` get `Access-Control-Allow-Origin` with credentials. Non-browser / same-origin requests (no `Origin` header) are allowed.
- **Server-side payload validation** — sharp re-checks every submitted composite: MIME type, decodability, dimensions, aspect ratio, file size. The client's claims are never trusted.
- **JWT in httpOnly cookie** — admin sessions are not accessible to JavaScript; `SameSite=Lax` provides CSRF protection.
- **No original photo storage** — only the baked composite JPEG is stored; source photos never leave the user's browser.
