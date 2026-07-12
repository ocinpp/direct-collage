<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
    <h1 class="font-display text-3xl uppercase tracking-tight">Wall not found</h1>
    <p class="text-ink/70">The QR code you scanned doesn't match a live wall.</p>
    <RouterLink
      class="stamp-press border-2 border-ink bg-brand-500 px-6 py-2.5 font-display text-sm uppercase tracking-wide text-white stamp-shadow"
      to="/demo"
    >
      Try the demo wall
    </RouterLink>
  </div>
</template>
