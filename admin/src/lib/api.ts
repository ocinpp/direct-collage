import type {
  WallPublicDTO,
  CompositeQueueDTO,
  WallAnalyticsDTO,
} from "@direct-collage/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login(email: string, password: string) {
      return request<{ email: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },
    logout() {
      return request("/api/auth/logout", { method: "POST" });
    },
    me() {
      return request<{ email: string } | { error: string }>("/api/auth/me");
    },
  },

  walls: {
    list() {
      return request<WallPublicDTO[]>("/api/admin/walls");
    },
    get(id: string) {
      return request<WallPublicDTO>(`/api/admin/walls/${id}`);
    },
    patch(
      id: string,
      body: Partial<
        Pick<
          WallPublicDTO,
          "title" | "name" | "bgColor" | "textColor" | "headerLogo" | "scrollSpeed" | "maxPhotos" | "displayMode"
        >
      >,
    ) {
      return request<WallPublicDTO>(`/api/admin/walls/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
  },

  queue: {
    list(wallId: string) {
      return request<CompositeQueueDTO[]>(`/api/admin/queue/${wallId}`);
    },
    approve(id: string) {
      return request<CompositeQueueDTO>(`/api/admin/composites/${id}/approve`, {
        method: "POST",
      });
    },
    reject(id: string) {
      return request<CompositeQueueDTO>(`/api/admin/composites/${id}/reject`, {
        method: "POST",
      });
    },
  },

  analytics: {
    get(wallId: string) {
      return request<WallAnalyticsDTO>(`/api/admin/analytics/${wallId}`);
    },
  },
};
