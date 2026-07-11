<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 class="text-2xl font-semibold">Wall not found</h1>
    <p class="text-neutral-400">The QR code you scanned doesn't match a live wall.</p>
    <RouterLink to="/demo" class="rounded-lg bg-brand-600 px-4 py-2 font-medium">
      Try the demo wall
    </RouterLink>
  </div>
</template>
