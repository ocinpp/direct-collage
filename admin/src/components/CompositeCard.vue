<script setup lang="ts">
import type { CompositeQueueDTO } from "@direct-collage/shared";

defineProps<{
  composite: CompositeQueueDTO;
  busy: boolean;
}>();

defineEmits<{
  approve: [];
  reject: [];
}>();
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-white shadow">
    <div class="relative aspect-square bg-neutral-200">
      <img
        :src="composite.url"
        :alt="`Composite ${composite.id}`"
        class="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
    <div class="p-3">
      <div class="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{{ composite.templateVariant }}</span>
        <span>{{ new Date(composite.createdAt).toLocaleTimeString() }}</span>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          :disabled="busy"
          class="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          @click="$emit('approve')"
        >
          Approve
        </button>
        <button
          type="button"
          :disabled="busy"
          class="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          @click="$emit('reject')"
        >
          Reject
        </button>
      </div>
    </div>
  </div>
</template>
