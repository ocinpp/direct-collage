import { ref, shallowRef } from "vue";
import type { CompositePublicDTO, WallPublicDTO } from "@direct-collage/shared";
import { SSE_EVENTS } from "@direct-collage/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

/**
 * Load a wall: fetch its config, then its approved composites (newest-first),
 * then open an SSE stream for real-time pushes.
 *
 * FIFO CAP: the composites array is capped at `maxPhotos` (default 100). When
 * a new photo arrives and the array is at capacity, the oldest (last index)
 * is dropped. All wall modes inherit this eviction automatically — the array
 * they receive is always ≤ maxPhotos items.
 */
const DEFAULT_MAX_PHOTOS = 100;

export function useFeed() {
  const wall = ref<WallPublicDTO | null>(null);
  /** shallowRef: large arrays of image URLs shouldn't be deeply reactive. */
  const composites = shallowRef<CompositePublicDTO[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const connected = ref(false);

  let eventSource: EventSource | null = null;

  /** Current max photos cap (from wall config, default 100). */
  function maxPhotos(): number {
    return wall.value?.maxPhotos ?? DEFAULT_MAX_PHOTOS;
  }

  /**
   * Cap the array to maxPhotos (FIFO eviction). Newest items are at the
   * front (index 0); when over capacity, drop from the end (oldest).
   * Returns a new array (shallowRef requires identity change for reactivity).
   */
  function cap(items: CompositePublicDTO[]): CompositePublicDTO[] {
    const limit = maxPhotos();
    if (items.length <= limit) return items;
    return items.slice(0, limit);
  }

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
      composites.value = cap(feedRes);

      const currentSlug = slug;

      // Open SSE for live updates.
      eventSource = new EventSource(`${BASE}/api/walls/${encodeURIComponent(slug)}/stream`);

      // On connect/reconnect: re-fetch the feed to recover any approvals that
      // were emitted while we were disconnected. Dedupe + cap.
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
              const merged = [...newOnes, ...composites.value];
              const seen = new Set<string>();
              const deduped = merged.filter((c) =>
                seen.has(c.id) ? false : (seen.add(c.id), true),
              );
              composites.value = cap(deduped);
            }
          }
        } catch {
          // Non-fatal — the SSE push path still works for live updates.
        }
      });

      eventSource.addEventListener(SSE_EVENTS.COMPOSITE_APPROVED, (e) => {
        const c = JSON.parse((e as MessageEvent).data) as CompositePublicDTO;
        // Prepend (newest-first). Dedupe by id, then cap (evict oldest).
        const updated = [c, ...composites.value.filter((x) => x.id !== c.id)];
        composites.value = cap(updated);
      });

      eventSource.onerror = () => {
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
