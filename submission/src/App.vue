<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <!-- grain-overlay adds the film-grain ::before layer site-wide. -->
  <div class="grain-overlay min-h-full bg-paper text-ink">
    <RouterView />
  </div>
</template>
