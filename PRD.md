# 📄 Product Requirements Document (PRD)
**Project Name:** DirectCollage (MVP)
**Document Version:** 2.6
**Date:** 2026-07-11
**Status:** Approved for Development

## Changelog

| Version | Date | Changes |
| :--- | :--- | :--- |
| 2.1 | 2023-10-27 | Tech stack updated to use the Vue.js ecosystem. |
| 2.2 | 2026-07-11 | Incorporated feasibility-review findings: SQLite for DB (via Prisma) + local-file storage for the demo; added client-side image pre-processing (EXIF + downsampling); corrected zoom-limit formula; added server-side payload validation & size cap; specified widget isolation; clarified wall ordering, soft-delete semantics, submit idempotency, and network resilience. |
| 2.3 | 2026-07-11 | Set default output aspect ratio to 4:5 portrait (1080×1350), based on the confirmed primary display surface (landscape screen, multi-column grid). |
| 2.4 | 2026-07-11 | Flipped default output aspect ratio to **square 1:1 (1080×1080)** after seeing the actual wall reference: a 5×4 grid of square cells. A portrait composite would letterbox (read small) or crop away user-arranged content; a square composite fills the square cell perfectly. 4:5 and 9:16 remain supported as non-default per-wall options. |
| 2.5 | 2026-07-11 | Added layout **variants** within the Triad and Pentagon templates: Triad now offers 3 layouts (default *Top-Big*, plus *Row* and *Columns*); Pentagon now offers 2 layouts (default *Top-Big*, plus *Row*). Solo and Quad remain single-layout. Reframed §4 / §6.1.1 / §7 around "template families" with selectable variants. |
| 2.6 | 2026-07-11 | Specified wall overflow behavior as **vertical auto-scroll** (newest at top, drifts down, loops). Chosen over horizontal film-strip and paged rotation because it preserves the dense multi-column square grid, aligns newest-first ordering with top-entry, and satisfies the instant-appear-on-approval requirement without a special case. Added scroll-speed and empty-state handling. Clarified that the grid **structure is stable** (columns/cell size don't change on new photos — only row count grows), and specified **hybrid new-photo reflow**: new photo slides into cell 1 with a FLIP-style animation, auto-scroll pauses ~0.5s to avoid jank, then resumes; instant wow if above the fold, queued-at-top otherwise. |

**Update Note:** §6.1, §6.3, §8, and §9 have substantive additions. New subsections are marked **[NEW]**. Modified requirements are marked **[UPDATED]**.

---

## 1. Product Overview
DirectCollage is an interactive, photo-booth-style User-Generated Content (UGC) platform for events and websites. Attendees scan a QR code, select a portrait collage template (1, 3, 4, or 5 images), and arrange their photos. The client device "bakes" these photos into a single high-resolution composite image, which is submitted to a moderation queue. Approved composites are displayed in real-time on a media wall.

## 2. Problem Statement & Value Proposition
Event organizers want high-quality, engaging visual content on their digital screens. Standard social walls often display poorly cropped or low-res images. DirectCollage solves this by putting the layout control in the user's hands via a collage generator, ensuring every post on the wall is a perfectly framed, high-resolution composite without the need for complex server-side image processing.

## 3. Target Audience
*   **Submitters:** Event attendees interacting via their personal smartphones.
*   **Admins:** Event organizers or marketers managing the live display.
*   **Viewers:** The audience viewing the digital signage or website embed.

## 4. Scope (MVP)

### **In Scope:**
*   QR code generation and mobile web portal.
*   4 Collage Template Families — Solo (1), Triad (3), Quad (4), Pentagon (5) — with selectable layout variants where noted (see §7): Triad offers 3 layouts, Pentagon offers 2 layouts; Solo and Quad have a single layout each.
*   Multi-photo upload and arrangement UI.
*   **Client-side image pre-processing: EXIF orientation correction and source downsampling. [NEW]**
*   Client-side dynamic zoom limits to prevent pixelation.
*   HTML5 Canvas API "baking" (compositing) into a single image (default 1:1 square).
*   Server-side payload validation for submitted composites.
*   Admin moderation queue (Approve/Reject).
*   Real-time, embeddable media wall display.

### **Out of Scope:**
*   Social media aggregation (Instagram, X, etc.).
*   Server-side image manipulation or storage of original unbaked photos.
*   Video or GIF uploads.
*   AI-powered moderation.
*   User accounts or profiles for submitters.
*   **Multi-process/horizontal scaling of the real-time layer (single Node process is sufficient for the demo).**
*   **Cloud object storage (S3) at launch — local file storage is used for the MVP; S3 remains the production target behind a storage adapter.**

## 5. Core User Flows

**Phase 1: Content Submission (The Attendee)**
1.  **Access:** The user scans a QR code displayed at the event using their smartphone.
2.  **Template Selection:** The mobile web portal loads. The user selects a collage layout (Solo, Triad, Quad, or Pentagon).
3.  **Upload & Arrange:** Based on the template, the user is prompted to upload the required number of photos (1, 3, 4, or 5). Each photo is normalized on upload (EXIF-corrected and downscaled — see §6.1.2). The user can drag to reorder photos and pinch/zoom to crop each photo within its designated frame.
4.  **Quality Control:** The system dynamically restricts zooming if the user attempts to zoom past the point of pixelation for the final output size.
5.  **Bake & Submit:** The user checks the "Permission to Display" box and submits. The browser uses the HTML5 Canvas API to merge all arranged photos into a single composite image (default **1080×1080px, 1:1 square**). Only this final composite JPEG is uploaded.

**Phase 2: Content Moderation (The Admin)**
1.  **Queue Review:** The organizer logs into the Admin Dashboard and views the Moderation Queue.
2.  **Visual Inspection:** The queue displays the final, baked composite images exactly as they will appear on the wall.
3.  **Action:** The admin clicks "Approve" to push the image to the live wall, or "Reject" to remove it from the queue. Rejection performs a **soft-delete** (file removed from the queue; a metadata record with status and timestamp is retained for analytics — see §6.2.3).

**Phase 3: Wall Display (The Audience)**
1.  **Embed/Load:** The Media Wall loads on a digital screen or website via a JavaScript snippet.
2.  **Real-Time Update:** The wall maintains a WebSocket connection. The moment an admin approves a composite, it appears on the screen instantly.
3.  **Render:** The wall displays the composites in a clean, responsive grid (square cells by default) that adapts to the screen size.

## 6. Functional Requirements

### **6.1. Submission Portal (Client-Side Web App)**

#### 6.1.1. Template Engine
Must support 4 template **families**, each with one or more selectable layout **variants** (full geometry in §7):

*   **Solo** (1 image) — 1 layout: full-frame.
*   **Triad** (3 images) — 3 layouts:
    *   **Triad / Top-Big** (default): 1 large image on top, 2 smaller side-by-side below.
    *   **Triad / Row**: 1 large image on the left, 2 smaller side-by-side on the right (single row, big-first).
    *   **Triad / Columns**: 3 identical-size columns side by side.
*   **Quad** (4 images) — 1 layout: 2×2 uniform grid.
*   **Pentagon** (5 images) — 2 layouts:
    *   **Pentagon / Top-Big** (default): 1 large image on top, 2×2 grid of 4 below.
    *   **Pentagon / Row**: 1 large image on the left, 4 smaller side-by-side on the right (single row, big-first).

The submission UI lets the user first pick a family, then (where multiple variants exist) pick a layout. Default variant is pre-selected.

#### 6.1.2. Image Pre-Processing **[NEW]**
Every uploaded source photo must be normalized **before** it enters the arrange/zoom UI and before compositing:
*   **EXIF orientation correction:** Read the photo's EXIF orientation tag and draw it into an intermediate scratch canvas with correct rotation/flip. (`drawImage` ignores EXIF — without this step, mobile photos arrive rotated/mirrored.)
*   **Source downsampling:** If the longest edge of the decoded source exceeds the maximum useful resolution (the larger of: the relevant slot's output dimension × the 1.2× oversample headroom, or a defined cap), downscale to that bound. This keeps peak memory low enough to avoid mobile-tab crashes (notably iOS Safari) when several large photos are held in memory simultaneously.
*   **Implementation basis:** Use an EXIF-aware image loader (e.g., `blueimp-load-image` or `browser-image-compression`).
*   The pre-processing step runs with a visible progress indicator; its duration depends on device performance and source resolution (expect up to several seconds for 5 high-MP images on low-end Android). The "< 2 second" performance budget (§8) applies to the **composite bake** step only, not to pre-processing.

#### 6.1.3. Multi-Upload
UI must allow uploading multiple images simultaneously, with clear indicators for which slot is being filled. Uploaded photos are normalized per §6.1.2 as they enter.

#### 6.1.4. Dynamic Zoom Limit **[UPDATED]**
The cropping UI computes a per-axis maximum scale to prevent pixelated output:

```
MaxScale_x = (SourceWidth  / SlotOutputWidth)  * 1.2
MaxScale_y = (SourceHeight / SlotOutputHeight) * 1.2
MaxScale   = min(MaxScale_x, MaxScale_y)
```

The effective clamp is the **minimum** of the two axes so the user cannot over-zoom on the shorter dimension of a non-square slot. The 1.2× factor permits mild oversampling (tolerable on retina displays).

#### 6.1.5. Composite Baking
On submit, the app renders all uploaded photos into a single canvas matching the template layout, then exports as a JPEG (quality 0.85+).

#### 6.1.6. Submit Payload & Idempotency **[UPDATED]**
The HTTP POST request must contain only:
*   `wall_id`
*   `composite_image_file`
*   `permission_granted` (boolean)

**Idempotency:** the submit button is disabled immediately on first tap and the request is single-flighted (no in-flight duplicate on double-tap or retry storms). Retries on network failure reuse the same request and must not create duplicate queue entries.

**Network resilience:** the upload shows progress and supports retry on transient failure (event Wi-Fi/cellular is often congested). The client must remain usable with a flaky connection.

### **6.2. Admin Moderation Dashboard**

#### 6.2.1. Authentication
Secure login.

#### 6.2.2. Wall Management
Create walls, generate unique QR codes/URLs, pause walls.

#### 6.2.3. Moderation Queue **[UPDATED]**
Visual grid of pending composites. One-click Approve/Reject.
*   **Approve:** push the image to the live wall (status → `approved`).
*   **Reject:** **soft-delete.** The composite is removed from the pending queue and its stored file is deleted, but a metadata row (status → `rejected`, timestamp) is retained so that analytics counts remain accurate and a mis-click can be inspected. Rejection is not silently irreversible from the data-record standpoint.

#### 6.2.4. Analytics (Basic)
Track total submissions, approved count, rejected count per wall (sourced from the retained metadata rows).

### **6.3. Media Wall Display**

#### 6.3.1. Embeddable Widget **[NEW]**
Generates a JS snippet for external sites. The widget **must be isolated from the host page** to avoid CSS leakage and to survive restrictive host Content-Security-Policy. Ship the widget inside an **iframe** (preferred for robustness) or a Shadow DOM root.

#### 6.3.2. Real-Time
WebSockets (Socket.io) for instant display updates. For the MVP a single Node process is sufficient; a Redis adapter is reserved as a production-scaling step (see §8.4).

#### 6.3.3. Responsive Grid
The wall uses CSS Grid to arrange the composites dynamically (e.g., 1 column on mobile, 3 on tablet, 5 on large screens). Cell aspect ratio matches the wall's configured composite ratio (square by default → `aspect-ratio: 1`).

#### 6.3.4. Ordering, Pacing & Overflow **[UPDATED]**
*   **Default ordering:** newest-approved first — newest photos render at the top of the grid. (Admin-configurable to shuffle is a future option.)
*   **Grid structure is stable:** the column count is fixed by responsive breakpoints (1 mobile / 3 tablet / 5 large). Adding photos **never** changes the columns or cell size — it only adds rows. The layout does not reconfigure or jump when a photo appears.
*   **Overflow behavior — vertical auto-scroll:** when approved composites exceed the viewport, the wall **continuously auto-scrolls vertically (downward)** through the full set, looping back to the top when it reaches the end. This keeps the dense multi-column square-grid look (e.g., the 5-column reference) while making every photo reachable on a passive screen with no manual interaction.
    *   **Scroll speed:** slow and constant (tunable per wall; ~one row every few seconds as a starting point). Must be slow enough to read each composite.
    *   **Empty/low-count state:** when fewer photos than needed to fill the viewport, the grid is statically centered (no scroll).
*   **New-photo appearance — hybrid reflow:** when a new composite is approved, it is inserted at the **first cell** (top of feed) and existing photos shift down by one cell. To avoid jank between the insert and the ambient scroll, the wall uses a **hybrid** behavior:
    *   The new photo **slides into cell 1** with a smooth reflow animation; existing cells shift down correspondingly. Implement with a FLIP-style technique (record pre-render positions, apply the insert, animate from old → new positions) so the shift is fluid, not a snap.
    *   Ambient auto-scroll **pauses for ~0.5s** during the reflow so the two motions don't compound, then resumes.
    *   **If the new photo is above the fold** (top cells currently visible), it is seen immediately — the attendee looking up right after submitting sees their photo appear. This satisfies the §5 "< 1 second" real-time update requirement.
    *   **If the viewer is scrolled deep** in a long feed when the photo lands, the photo is queued at the top and will be seen when the loop returns to the top. (For the MVP this is acceptable; a future enhancement could briefly highlight the new item.)
    *   The new cell may use a subtle highlight (e.g., a brief border/opacity pulse) on entry to draw the eye.
*   **Direction rationale:** vertical was chosen over horizontal because (a) it preserves the dense multi-column grid aesthetic confirmed for the wall, whereas a horizontal film-strip typically shows fewer rows, and (b) top-entry aligns naturally with newest-first ordering and the instant-appear requirement.

#### 6.3.5. Branding
Admin can set a background color and header logo for the wall.

## 7. Template Specifications

All templates output a single composite image whose aspect ratio is **per-wall configurable**. All composites on a given wall use that wall's configured ratio.

*   **Default: 1:1 square (1080×1080px).** Chosen because the confirmed primary display surface is a **landscape social wall laid out as a grid of square cells** (e.g., a 5×4 grid). A square composite fills a square cell edge-to-edge with no waste. A portrait composite pushed into a square cell would either letterbox (read small on the screen) or be cropped — destroying the content the user carefully arranged. Square also makes the responsive grid math trivial (`aspect-ratio: 1`) and simplifies the Pentagon geometry.
*   **Supported alternative: 4:5 portrait (1080×1350px).** Use when a wall's grid uses taller-than-square cells, or for a portrait-forward aesthetic.
*   **Supported alternative: 9:16 portrait (1080×1920px).** For vertical signage or a "cinematic" full-bleed single-image wall.

> **Trade-off acknowledged:** square slots crop individual source photos harder than tall slots (less vertical safe area per face). The zoom/pan crop UI (§6.1.4) lets the user control framing within the slot, which absorbs this cost. This is the conventional Instagram-grid aesthetic and matches the reference wall.

| Template (Variant) | Image Count | Layout Description (CSS Grid Analogy) |
| :--- | :--- | :--- |
| **Solo** | 1 | Single cell taking up 100% of the canvas. |
| **Triad — Top-Big** *(default)* | 3 | 2-row grid. Row 1: 1 cell (span 2 cols). Row 2: 2 cells (1 col each). |
| **Triad — Row** | 3 | 1-row grid. Col 1: 1 wide cell (~55%). Cols 2–3: 2 narrow cells (~22% each), side by side. |
| **Triad — Columns** | 3 | 1-row grid. 3 equal columns (~33% each), identical size, side by side. |
| **Quad** | 4 | 2×2 uniform grid. 2 columns, 2 rows. |
| **Pentagon — Top-Big** *(default)* | 5 | 2-row grid. Row 1: 1 cell (span 2 cols). Row 2: 2×2 grid (4 cells). |
| **Pentagon — Row** | 5 | 1-row grid. Col 1: 1 wide cell (~40%). Cols 2–5: 4 narrow cells (~15% each), side by side. |

> **Design note on "Row" variants:** in a square output, the narrow cells in *Triad / Row* and especially *Pentagon / Row* become tall vertical strips (~22% and ~15% of width respectively). They are functional and deliberately chosen by the user, but the Top-Big defaults give better per-face proportions. The Row variants exist for organizers who want a horizontal banner-style composite.

## 8. Non-Functional Requirements

*   **Performance:**
    *   Client-side **composite bake** should take < 2 seconds on typical devices.
    *   Image **pre-processing** (EXIF + downsample) may take longer on low-end devices and is shown with a progress indicator; it is not bound by the 2-second budget.
    *   Wall real-time updates < 1 second.

### 8.1. Tech Stack — Frontend
*   **Submission Portal & Wall Widget:** Vue 3 (Composition API) + Vite. (Nuxt 3 optional for SSR/SEO of any standalone public wall URL; the embeddable widget itself remains a standalone Vite-built Vue app so it can be dropped into arbitrary host pages.)
*   **Admin Dashboard:** Vue 3 + Vite.
*   **UI Framework:** Tailwind CSS.
*   **State management:** Pinia (submission wizard state; admin queue state).
*   **Client image handling:** EXIF-aware loader (e.g., `blueimp-load-image` or `browser-image-compression`).
*   **Crop/zoom UI:** custom canvas-based cropper, to enforce the §6.1.4 per-axis Max-Scale clamp precisely. (A library such as `vue-advanced-cropper` may be used only if it exposes the needed scale clamps.)

### 8.2. Tech Stack — Backend
*   **Runtime / framework:** Node.js / Express.
*   **Database:** **SQLite** for the MVP, accessed via **Prisma**. Enable WAL mode (`PRAGMA journal_mode=WAL`) at connection time for concurrent reads during writes.
    *   *Rationale:* the MVP targets a small number of users (1–2) for a demo; SQLite removes a separate DB service and keeps the entire DB in a single file. Prisma keeps the schema portable — switching the `provider` to `postgresql` and changing the connection string is the bulk of a future migration if scale or Postgres-specific features are ever required.
*   **Storage:** **local filesystem** (`uploads/` directory served statically by Express) for the MVP, behind a `StorageAdapter` interface (methods: `save`, `read`, `delete`, `url`).
    *   *Rationale:* zero cloud setup for the demo; swapping to AWS S3 later is a single adapter implementation. Only composite images are stored — never original, unbaked photos.
*   **Real-time:** Socket.io (single process; Redis adapter reserved for production scaling — see §8.4).

### 8.3. Security
*   Rate limiting on submission endpoints.
*   No storage of original, unbaked user photos (privacy + storage cost).
*   **Server-side payload validation (do not trust the client):** because baking happens client-side, the server must independently validate every submitted composite:
    *   Correct MIME type (JPEG).
    *   Decodable as a real JPEG (not a renamed arbitrary file).
    *   Dimensions and aspect ratio within template-allowed bounds.
    *   File size within an enforced cap (e.g., ≤ ~3 MB — a quality-0.85 JPEG at 1080×1080 is realistically well under this).
    *   `wall_id` exists and is active; `permission_granted` is `true`.
    *   Reject any submission that fails validation; never trust dimensions/claims reported by the client.

### 8.4. Scalability (deferred)
The following are **out of scope for the MVP** but the architecture must not preclude them:
*   Horizontal scaling of the real-time layer via the Socket.io Redis adapter.
*   Migration from SQLite to PostgreSQL via Prisma.
*   Migration from local storage to AWS S3 via the `StorageAdapter`.
