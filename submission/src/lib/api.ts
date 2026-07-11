import type { WallPublicDTO, CompositeQueueDTO, TemplateVariant } from "@direct-collage/shared";

/**
 * API base URL. In dev, Vite proxies "/api" to the server (same-origin, so the
 * admin cookie and CORS "just work"). When embedding or pointing at a remote
 * server, set VITE_API_URL.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Public wall config (drives template options + output aspect ratio). */
  getWall(slug: string): Promise<WallPublicDTO> {
    return getJson(`/api/walls/${encodeURIComponent(slug)}`);
  },

  /**
   * Submit the baked composite JPEG. multipart/form-data on the wire:
   *   - composite_image : File (the baked JPEG)
   *   - template_variant : string
   *   - permission_granted : "true"
   *
   * `onProgress` wires into XMLHttpRequest because fetch() has no upload
   * progress yet (as of mid-2026). Returns the created queue row.
   */
  submitComposite(opts: {
    wallSlug: string;
    file: Blob;
    templateVariant: TemplateVariant;
    permissionGranted: boolean;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }): Promise<CompositeQueueDTO> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("composite_image", opts.file, "collage.jpg");
      form.append("template_variant", opts.templateVariant);
      form.append("permission_granted", String(opts.permissionGranted));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/api/submit/${encodeURIComponent(opts.wallSlug)}`);
      xhr.withCredentials = true;
      xhr.responseType = "json";

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && opts.onProgress) {
          opts.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response as CompositeQueueDTO);
        } else {
          const msg =
            (xhr.response as { error?: string } | null)?.error ??
            `Submit failed (${xhr.status})`;
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

      if (opts.signal) {
        opts.signal.addEventListener("abort", () => xhr.abort());
      }

      xhr.send(form);
    });
  },
};
