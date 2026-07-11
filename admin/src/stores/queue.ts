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

  async function load(wallId: string) {
    loading.value = true;
    error.value = null;
    try {
      items.value = await api.queue.list(wallId);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load queue";
    } finally {
      loading.value = false;
    }
  }

  async function approve(id: string) {
    actingId.value = id;
    try {
      await api.queue.approve(id);
      items.value = items.value.filter((c) => c.id !== id);
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
      items.value = items.value.filter((c) => c.id !== id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Reject failed";
    } finally {
      actingId.value = null;
    }
  }

  return { items, loading, error, actingId, load, approve, reject };
});
