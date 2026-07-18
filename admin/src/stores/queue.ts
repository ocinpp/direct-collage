import { defineStore } from "pinia";
import { ref } from "vue";
import type { CompositeQueueDTO } from "@direct-collage/shared";
import { api } from "../lib/api.js";

export const useQueueStore = defineStore("queue", () => {
  const items = ref<CompositeQueueDTO[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** id of the composite currently being acted on (for button spinner state). */
  const actingId = ref<string | null>(null);
  /** Current active status tab + wallId for reloads after actions. */
  const activeStatus = ref<string>("PENDING");
  let currentWallId: string | null = null;

  async function load(wallId: string, status?: string) {
    currentWallId = wallId;
    if (status) activeStatus.value = status;
    loading.value = true;
    error.value = null;
    try {
      items.value = await api.queue.list(wallId, activeStatus.value);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load queue";
    } finally {
      loading.value = false;
    }
  }

  /** Reload the current tab (used after status changes). */
  async function reload() {
    if (currentWallId) await load(currentWallId);
  }

  async function approve(id: string) {
    actingId.value = id;
    try {
      await api.queue.approve(id);
      // Reload the active tab — the item moves to a different status.
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

  return { items, loading, error, actingId, activeStatus, load, reload, approve, reject };
});
