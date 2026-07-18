import { defineStore } from "pinia";
import { ref } from "vue";
import type { CompositeQueueDTO } from "@direct-collage/shared";
import { api } from "../lib/api.js";

export const useQueueStore = defineStore("queue", () => {
  const items = ref<CompositeQueueDTO[]>([]);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref<string | null>(null);
  const actingId = ref<string | null>(null);
  const activeStatus = ref<string>("PENDING");
  const nextCursor = ref<string | null>(null);
  /** True when more pages are available. */
  const hasMore = ref(false);
  let currentWallId: string | null = null;

  /**
   * Load page 1 (fresh). Called on tab switch, poll refresh, and after
   * status changes. Resets items + cursor.
   */
  async function load(wallId: string, status?: string) {
    currentWallId = wallId;
    if (status) activeStatus.value = status;
    loading.value = true;
    error.value = null;
    try {
      const page = await api.queue.list(wallId, activeStatus.value);
      items.value = page.items;
      nextCursor.value = page.nextCursor;
      hasMore.value = page.nextCursor !== null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load queue";
    } finally {
      loading.value = false;
    }
  }

  /**
   * Refresh page 1 WITHOUT resetting scroll position. Used by the poll —
   * merges fresh items on top, preserves loaded pages below. Dedupes by id.
   * Does NOT touch hasMore/nextCursor — those are managed by load/loadMore
   * only. The poll has no business changing pagination state.
   */
  async function refresh() {
    if (!currentWallId) return;
    try {
      const page = await api.queue.list(currentWallId, activeStatus.value);
      // Merge: fresh page 1 items on top, then existing items (minus any
      // that are already in page 1). Dedupe by id.
      const freshIds = new Set(page.items.map((c) => c.id));
      const older = items.value.filter((c) => !freshIds.has(c.id));
      items.value = [...page.items, ...older];
    } catch {
      // Non-fatal — poll errors are silent
    }
  }

  /**
   * Load the next page (append). Uses the cursor from the last fetch.
   * Items are appended; older pages are stable snapshots.
   */
  async function loadMore() {
    if (!currentWallId || !nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await api.queue.list(
        currentWallId,
        activeStatus.value,
        nextCursor.value,
      );
      // If the server returned 0 items despite a cursor, there's nothing
      // more — hide the button (edge case with timestamp collisions).
      if (page.items.length === 0) {
        hasMore.value = false;
        nextCursor.value = null;
        return;
      }
      // Append, deduping by id.
      const existingIds = new Set(items.value.map((c) => c.id));
      const fresh = page.items.filter((c) => !existingIds.has(c.id));
      items.value = [...items.value, ...fresh];
      nextCursor.value = page.nextCursor;
      hasMore.value = page.nextCursor !== null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load more";
    } finally {
      loadingMore.value = false;
    }
  }

  /** Reload the current page 1 (used after approve/reject actions). */
  async function reload() {
    if (currentWallId) await load(currentWallId);
  }

  async function approve(id: string) {
    actingId.value = id;
    try {
      await api.queue.approve(id);
      await reload();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Approve failed";
    } finally {
      actingId.value = null;
    }
  }

  async function reject(id: string) {
    actingId.value = id;
    try {
      await api.queue.reject(id);
      await reload();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Reject failed";
    } finally {
      actingId.value = null;
    }
  }

  return {
    items,
    loading,
    loadingMore,
    error,
    actingId,
    activeStatus,
    nextCursor,
    hasMore,
    load,
    refresh,
    loadMore,
    reload,
    approve,
    reject,
  };
});
