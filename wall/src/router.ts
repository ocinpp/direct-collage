import { createRouter, createWebHistory } from "vue-router";

/**
 * The wall is a public, read-only display:
 *   /:wallSlug — fullscreen media wall
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/demo" },
    {
      path: "/:wallSlug",
      name: "wall",
      component: () => import("./views/Wall.vue"),
    },
  ],
});
