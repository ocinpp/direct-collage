import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../lib/api.js";

export const useAuthStore = defineStore("auth", () => {
  const email = ref<string | null>(null);
  const isAuthenticated = ref(false);
  /** Has the session probe completed? (so the router can decide) */
  const resolved = ref(false);

  /** Probe /api/auth/me once on app boot to restore a cookie session. */
  async function resolve() {
    if (resolved.value) return;
    try {
      const me = await api.auth.me();
      if ("email" in me) {
        email.value = me.email;
        isAuthenticated.value = true;
      }
    } catch {
      isAuthenticated.value = false;
    } finally {
      resolved.value = true;
    }
  }

  async function login(loginEmail: string, password: string) {
    const res = await api.auth.login(loginEmail, password);
    email.value = res.email;
    isAuthenticated.value = true;
    resolved.value = true;
  }

  async function logout() {
    await api.auth.logout();
    email.value = null;
    isAuthenticated.value = false;
  }

  return { email, isAuthenticated, resolved, resolve, login, logout };
});
