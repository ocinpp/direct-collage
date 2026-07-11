import { createRouter, createWebHistory } from "vue-router";

/**
 * Routes:
 *   /:wallSlug            — the submission wizard
 *   (anything else)       — redirect to a friendly "unknown wall" view
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/demo" },
    {
      path: "/:wallSlug",
      name: "submit",
      component: () => import("./views/Submit.vue"),
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("./views/NotFound.vue"),
    },
  ],
});
