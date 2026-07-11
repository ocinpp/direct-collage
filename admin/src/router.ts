import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth.js";

/**
 * Routes:
 *   /login            — public
 *   /walls/:id/queue  — moderation queue for a wall (auth)
 *   (root)            — redirect to first wall's queue, or walls list
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("./views/Login.vue") },
    {
      path: "/walls/:id/queue",
      name: "queue",
      component: () => import("./views/Queue.vue"),
      meta: { requiresAuth: true },
    },
    { path: "/:pathMatch(.*)*", redirect: "/login" },
  ],
});

// Auth guard: redirect to /login when a route requires auth and we're not sure
// we're logged in yet. The auth store resolves "me" on first navigation.
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    // Try to resolve the session once; if it fails, bounce to login.
    await auth.resolve();
    if (!auth.isAuthenticated) return { name: "login" };
  }
});
