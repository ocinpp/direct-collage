# DirectCollage

Photo-booth-style UGC collage platform for events. Attendees scan a QR code, pick a collage layout, arrange their photos, and the browser "bakes" them into a single composite. An admin moderates submissions, and approved composites appear on a live media wall in real time.

See [`PRD.md`](./PRD.md) for the full product spec (v2.6).

## How it works

```
Phone (submission)          Server (API)              Admin (moderation)        Wall (display)
┌─────────────┐   submit    ┌─────────────┐  approve   ┌─────────────┐   SSE    ┌─────────────┐
│ pick layout │ ──────────► │  validate   │ ◄────────► │  queue tabs │ ───────► │ live display│
│ upload      │   composite │  (sharp)    │            │  approve/   │  push    │ (5 modes)   │
│ crop/zoom   │             │  store      │            │  reject/    │          │             │
│ bake → JPEG │             │  SQLite     │            │  re-approve │          │             │
└─────────────┘             └─────────────┘            └─────────────┘          └─────────────┘
```

The browser does all image processing client-side (EXIF correction, downsampling, crop/zoom, canvas baking). The server only ever sees the final composite JPEG — never original photos.

## Monorepo layout

```
direct-collage/
  shared/         TS types + template geometry (8 layouts, no runtime)
  server/         Express + Prisma/SQLite(WAL) + sharp validation + SSE + JWT auth
  submission/     Vue 3 mobile portal — template picker, photo editor, canvas baker
  admin/          Vue 3 dashboard — login, moderation queue tabs, wall settings
  wall/           Vue 3 media wall — 5 display modes, SSE realtime, responsive
```

## Features

### Submission portal (mobile)
- **8 collage layouts**: Solo, Duo (2 columns), Triad (Top-Big / Row / Columns), Quad, Pentagon (Top-Big / Row)
- **Full-screen slot editor**: tap a slot → large crop/zoom/pan surface with a dimmed "full photo" preview + bright crop frame
- **Pinch-to-zoom + drag-to-pan** with anti-pixelation zoom clamping and pan-cover clamping (no black edges)
- **EXIF orientation correction** + source downsampling before editing
- **WYSIWYG baking**: the preview canvas uses the same draw math as the baker
- **WebP upload support** — source photos can be JPEG, PNG, or WebP
- **Retro Photobooth aesthetic**: cream paper, film grain, bold display type

### Admin dashboard
- JWT-cookie authentication (seeded admin account)
- **Moderation queue with tabs**: Pending / Approved / Rejected — drill into any status
- **Full status control**: approve, reject, re-approve rejected, reject approved — any transition allowed
- **Don't-delete-on-reject**: rejected files stay on disk so they can be re-approved; no data loss on misclick
- **Wall settings**: title, background color, text color, header logo URL, transition speed, max photos, display mode
- **Analytics panel**: total / approved / rejected / pending counts (auto-refreshing)

### Media wall (5 display modes)
All modes are admin-configurable per wall. New approved photos appear via SSE in real time.

| Mode | Description |
|---|---|
| **Scrolling Grid** | Masonry grid with 2×2 hero cells cycling through columns, auto-scroll with seamless loop, FLIP reflow on new photos |
| **Fullscreen Showcase** | One photo fills the screen with slow Ken Burns zoom/pan, cycling every few seconds, thumbnail strip at bottom |
| **Rotating Hero Bento** | Queue-based featured rotation — large photo on the left, smaller photos on the right, FIFO fairness |
| **Scattered Polaroids** | Tilted white-bordered photos in a flex-wrap layout, auto-scrolling, new photos queue and append to the bottom |
| **Flip Card Wave** | Grid of 3D flip cards that flip in a left-to-right wave, revealing shuffled photos on the back face |

**Transition speed** (0–100) is universal: controls scroll drift for scrolling modes, cycle time for cycling modes. **Max photos** (FIFO cap, default 100) applies to all modes — oldest photos evicted as new ones arrive.

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
2. Set it in `server/.env` (so the server emits reachable image URLs + CORS allows the origin):
   ```env
   PUBLIC_BASE_URL=http://<your-lan-ip>:4000
   CORS_ORIGIN=http://<your-lan-ip>:5173,http://<your-lan-ip>:5174,http://<your-lan-ip>:5175
   ```
3. Restart the server: `npm run dev:server`
4. Open `http://<your-lan-ip>:5173/demo` on your phone

> **DHCP note:** if your phone suddenly can't connect, your Mac's IP likely changed. Re-run `ipconfig getifaddr en0`, update `PUBLIC_BASE_URL` and `CORS_ORIGIN`, and restart.

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

## Production

The simplest production deploy is **same-origin**: the Express server serves the API + all three built frontends from a single port.

```bash
npm run build                    # builds shared → server → submission → admin → wall
node server/dist/index.js        # serves everything on :4000
```

| App         | URL                              |
| ----------- | -------------------------------- |
| API         | `http://<host>:4000/api`         |
| Submission  | `http://<host>:4000/submit/demo` |
| Admin       | `http://<host>:4000/admin-ui/login` |
| Wall        | `http://<host>:4000/wall-ui/demo`|

### Split-origin deploy (optional)

Set `VITE_API_URL` at **build time** (via `.env.production` in each app) to point the frontends at a separate API host.

### Environment variables (`server/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Server port |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Base URL for composite image URLs |
| `JWT_SECRET` | `dev-only-change-me` | **Change in production** — signs admin session tokens |
| `CORS_ORIGIN` | `localhost:5173,5174,5175` | Comma-separated allowlist of frontend origins |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window for submissions |
| `RATE_LIMIT_MAX` | `20` | Max submissions per IP per window |
| `MAX_UPLOAD_BYTES` | `3145728` | Max composite file size (3MB) |

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

- **SQLite for the MVP** — the DB stores only metadata. Images go to disk. Prisma keeps the schema portable; switching to PostgreSQL is a one-line `provider` change.
- **SSE, not Socket.io** — the wall only receives pushes (one-way), so SSE is simpler and lighter. `EventSource` auto-reconnects natively.
- **Client-side baking** — the browser merges all arranged photos into a single composite JPEG via Canvas. The server validates (never trusts) the result with sharp.
- **No original photo storage** — protects privacy and reduces storage cost. Only the final composite is uploaded.
- **FIFO maxPhotos cap** — `useFeed.ts` caps the composites array at `maxPhotos` (default 100). Oldest evicted as new ones arrive. All display modes inherit this.
- **Don't-delete-on-reject** — rejected files stay on disk for re-approval. A future cleanup script can purge old rejected files.

## Security

- **Rate limiting** on `POST /api/submit/:wallSlug` — 20 requests/minute/IP (configurable). Runs before multer decodes the upload.
- **CORS allowlist** — only origins in `CORS_ORIGIN` get `Access-Control-Allow-Origin` with credentials.
- **Server-side payload validation** — sharp re-checks every submitted composite: MIME type, decodability, dimensions, aspect ratio, file size.
- **JWT in httpOnly cookie** — admin sessions are not accessible to JavaScript; `SameSite=Lax` provides CSRF protection.
