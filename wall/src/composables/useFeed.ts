import { ref, shallowRef } from "vue";
import type { CompositePublicDTO, WallPublicDTO } from "@direct-collage/shared";
import { SSE_EVENTS } from "@direct-collage/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * Load a wall: fetch its config, then its approved composites (newest-first),
 * then open an SSE stream for real-time pushes.
 *
 * On `composite:approved`, the new photo is PREPENDED to the feed (newest at
 * top). Phase 1 keeps this simple — no auto-scroll, no FLIP reflow yet; those
 * are Phase 3 polish per the implementation plan.
 */
export function useFeed() {
  const wall = ref<WallPublicDTO | null>(null);
  /** shallowRef: large arrays of image URLs shouldn't be deeply reactive. */
  const composites = shallowRef<CompositePublicDTO[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const connected = ref(false);

  let eventSource: EventSource | null = null;

  async function load(slug: string) {
    loading.value = true;
    error.value = null;

    try {
      // Fetch config + initial feed in parallel.
      const [wallRes, feedRes] = await Promise.all([
        fetch(`${BASE}/api/walls/${encodeURIComponent(slug)}`).then((r) => {
          if (!r.ok) throw new Error("Wall not found");
          return r.json() as Promise<WallPublicDTO>;
        }),
        fetch(`${BASE}/api/walls/${encodeURIComponent(slug)}/feed`).then((r) => {
          if (!r.ok) throw new Error("Feed fetch failed");
          return r.json() as Promise<CompositePublicDTO[]>;
        }),
      ]);

      wall.value = wallRes;
      composites.value = feedRes;

      // Track the slug so the hello-handler can re-fetch the right wall after
      // a reconnect (closures can't access it reliably otherwise).
      const currentSlug = slug;

      // Open SSE for live updates.
      eventSource = new EventSource(`${BASE}/api/walls/${encodeURIComponent(slug)}/stream`);

      // On connect/reconnect: re-fetch the feed to recover any approvals that
      // were emitted while we were disconnected (EventSource has no resume/
      // lastEventId). Dedupe against existing composites so nothing doubles.
      eventSource.addEventListener(SSE_EVENTS.HELLO, async () => {
        connected.value = true;
        try {
          const res = await fetch(
            `${BASE}/api/walls/${encodeURIComponent(currentSlug)}/feed`,
          );
          if (res.ok) {
            const fresh = (await res.json()) as CompositePublicDTO[];
            const existingIds = new Set(composites.value.map((c) => c.id));
            const newOnes = fresh.filter((c) => !existingIds.has(c.id));
            if (newOnes.length > 0) {
              // Merge: newest-first, deduped.
              const merged = [...newOnes, ...composites.value];
              const seen = new Set<string>();
              composites.value = merged.filter((c) =>
                seen.has(c.id) ? false : (seen.add(c.id), true),
              );
            }
          }
        } catch {
          // Non-fatal — the SSE push path still works for live updates.
        }
      });

      eventSource.addEventListener(SSE_EVENTS.COMPOSITE_APPROVED, (e) => {
        const c = JSON.parse((e as MessageEvent).data) as CompositePublicDTO;
        // Prepend (newest-first). Dedupe by id in case of a replay.
        composites.value = [c, ...composites.value.filter((x) => x.id !== c.id)];
      });

      eventSource.onerror = () => {
        // EventSource auto-reconnects natively; just update the indicator.
        // On reconnect, the hello handler above re-fetches the feed.
        connected.value = false;
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load wall";
    } finally {
      loading.value = false;
    }
  }

  function disconnect() {
    eventSource?.close();
    eventSource = null;
    connected.value = false;
  }

  return { wall, composites, loading, error, connected, load, disconnect };
}
