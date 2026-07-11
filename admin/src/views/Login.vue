<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("admin@demo.local");
const password = ref("");
const error = ref<string | null>(null);
const submitting = ref(false);

onMounted(async () => {
  // If already logged in, bounce to the queue (or wherever login redirected from).
  await auth.resolve();
  if (auth.isAuthenticated) {
    router.replace((route.query.redirect as string) || "/walls/demo/queue");
  }
});

async function onSubmit() {
  error.value = null;
  submitting.value = true;
  try {
    await auth.login(email.value, password.value);
    router.replace((route.query.redirect as string) || "/walls/demo/queue");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Login failed";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-neutral-100 p-4">
    <form
      class="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-lg"
      @submit.prevent="onSubmit"
    >
      <h1 class="text-xl font-semibold">DirectCollage Admin</h1>

      <label class="block">
        <span class="text-sm font-medium text-neutral-700">Email</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="username"
          class="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium text-neutral-700">Password</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:outline-none"
        />
      </label>

      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {{ submitting ? "Signing in…" : "Sign in" }}
      </button>

      <p class="text-center text-xs text-neutral-400">
        Demo: admin@demo.local / changeme
      </p>
    </form>
  </div>
</template>
