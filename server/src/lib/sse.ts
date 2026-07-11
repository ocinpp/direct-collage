import type { Response } from "express";
import type { CompositePublicDTO } from "@direct-collage/shared";
import { SSE_EVENTS } from "@direct-collage/shared";

/**
 * Per-wall SSE client registry (PRD §6.3.2 / §8.2 — single process for MVP).
 *
 * The wall only ever receives events from the server (newly approved
 * composites), so SSE is used instead of Socket.io: it's one-way,
 * auto-reconnects natively via EventSource, and handles cross-origin cleanly
 * for the iframe-embedded widget (PRD §6.3.1).
 *
 * Each wall slug maps to a Set of open Responses. When an admin approves a
 * composite, we look up the wall's set and write an SSE frame to each.
 */
class SseRegistry {
  private clients = new Map<string, Set<Response>>();

  /** Register a client for a wall. Returns an unsubscribe function. */
  add(wallSlug: string, res: Response): () => void {
    let set = this.clients.get(wallSlug);
    if (!set) {
      set = new Set();
      this.clients.set(wallSlug, set);
    }
    set.add(res);

    // SSE handshake: disable buffering, set the stream content type, send hello.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Allow the embedded iframe widget (different origin) to connect.
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });
    this.send(res, SSE_EVENTS.HELLO, { ts: Date.now() });

    return () => {
      set?.delete(res);
      if (set && set.size === 0) {
        this.clients.delete(wallSlug);
      }
      try {
        res.end();
      } catch {
        /* already closed */
      }
    };
  }

  /** Push a composite:approved event to every client on a wall. */
  emitApproved(wallSlug: string, composite: CompositePublicDTO): void {
    const set = this.clients.get(wallSlug);
    if (!set || set.size === 0) return;
    for (const res of set) {
      this.send(res, SSE_EVENTS.COMPOSITE_APPROVED, composite);
    }
  }

  private send(res: Response, event: string, data: unknown): void {
    const payload =
      `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
    res.write(payload);
  }

  /** Total open connections across all walls (for /health). */
  get totalClients(): number {
    let n = 0;
    for (const set of this.clients.values()) n += set.size;
    return n;
  }
}

export const sse = new SseRegistry();
