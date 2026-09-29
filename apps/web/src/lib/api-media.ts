/**
 * MediaAsset REST API client — Sprint E2 (D-033).
 *
 * Three endpoints exercised here:
 *   - POST   /api/v1/admin/media/upload/   — multipart upload
 *   - GET    /api/v1/admin/media/          — paginated tenant list (kind filter)
 *   - DELETE /api/v1/admin/media/<id>/     — soft-delete
 *
 * The upload must use XMLHttpRequest so we can stream progress events
 * back to the caller (fetch has no progress API as of mid-2024). List
 * + delete use the regular `adminFetch` from `lib/api-admin.ts` so we
 * inherit the CSRF, cookie, and envelope handling.
 *
 * NOTE: `uploadMedia()` here uses the MediaAsset endpoint (returns the
 * full asset envelope). The legacy `uploadMedia()` exported from
 * `lib/api-admin.ts` hits the older `/admin/media/upload` route and is
 * kept only for the inline `ImageUpload` form picker.
 */

import { adminFetch, AdminApiError, type AdminFetchOptions } from "@/lib/api-admin";
import type { MediaAsset, MediaKind } from "@/types/media";

export { AdminApiError };

interface ListMediaOptions {
  /** Optional kind filter — 'image' | 'video' | 'audio' | 'file'. */
  kind?: MediaKind;
  /** Forwarded fetch options (baseUrl / internal / cookieHeader). */
  fetchOptions?: Pick<
    AdminFetchOptions,
    "baseUrl" | "internal" | "cookieHeader"
  >;
}

/**
 * GET /api/v1/admin/media/ — paginated tenant asset list.
 *
 * The backend returns `{ data: MediaAsset[], meta: { count } }` and
 * `adminFetch` is envelope-tolerant (it unwraps `data` automatically).
 */
export async function listMedia(
  options: ListMediaOptions = {},
): Promise<MediaAsset[]> {
  const query = options.kind ? `?kind=${encodeURIComponent(options.kind)}` : "";
  return adminFetch<MediaAsset[]>(`/api/v1/admin/media/${query}`, {
    ...options.fetchOptions,
  });
}

interface DeleteMediaOptions {
  fetchOptions?: Pick<
    AdminFetchOptions,
    "baseUrl" | "internal" | "cookieHeader" | "csrfToken"
  >;
}

/**
 * DELETE /api/v1/admin/media/<id>/ — soft-delete (is_active=false).
 *
 * Returns void on success. 204 No Content path.
 */
export async function deleteMedia(
  id: number,
  options: DeleteMediaOptions = {},
): Promise<void> {
  await adminFetch<void>(`/api/v1/admin/media/${id}/`, {
    method: "DELETE",
    ...options.fetchOptions,
  });
}

// ---------------------------------------------------------------------------
// Upload (XHR — needs progress events)
// ---------------------------------------------------------------------------

export interface UploadMediaProgress {
  loaded: number;
  total: number;
}

export interface UploadMediaOptions {
  /** Required: token echoed in `X-CSRFToken` header. */
  csrfToken: string;
  /** Optional alt text — stored on MediaAsset.alt_text (max 300 chars). */
  altText?: string;
  /** Optional override (tests / Storybook). */
  baseUrl?: string;
  /** Optional progress callback fired multiple times during the upload. */
  onProgress?: (progress: UploadMediaProgress) => void;
  /** Abort signal — caller can cancel an in-flight upload. */
  signal?: AbortSignal;
}

function resolveUploadBaseUrl(opts: { baseUrl?: string }): string {
  if (opts.baseUrl) return opts.baseUrl;
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.INTERNAL_API_BASE_URL ||
    "http://localhost:8000"
  );
}

/**
 * POST /api/v1/admin/media/upload/ — multipart upload, MediaAsset pipeline.
 *
 * Uses XMLHttpRequest rather than fetch so the caller can subscribe to
 * `progress` events (no upload-progress API on `fetch()` as of 2026).
 *
 * CSRF: Django's `SessionAuthentication` enforces CSRF on unsafe methods,
 * so we set `X-CSRFToken` from the token the parent pre-fetched (the
 * `qr_csrftoken` cookie is set automatically by Django's middleware on
 * the first GET).
 *
 * On a 2xx response the backend returns
 *   `{ data: MediaAsset, meta: {} }`
 * and we unwrap and return the asset directly.
 */
export function uploadMedia(
  file: File,
  options: UploadMediaOptions,
): Promise<MediaAsset> {
  return new Promise<MediaAsset>((resolve, reject) => {
    const base = resolveUploadBaseUrl({ baseUrl: options.baseUrl });
    const url = `${base.replace(/\/$/, "")}/api/v1/admin/media/upload/`;

    const formData = new FormData();
    formData.append("file", file);
    if (options.altText) {
      formData.append("alt_text", options.altText.slice(0, 300));
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true; // carry the session cookie
    xhr.setRequestHeader("X-CSRFToken", options.csrfToken);
    xhr.setRequestHeader("Accept", "application/json");

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("Upload iptal edildi.", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Upload iptal edildi.", "AbortError"));
      });
    }

    xhr.upload.onprogress = (e) => {
      if (!options.onProgress) return;
      if (e.lengthComputable) {
        options.onProgress({ loaded: e.loaded, total: e.total });
      }
    };

    xhr.onerror = () => {
      reject(
        new AdminApiError(
          0,
          "network.error",
          "Ağ hatası — dosya yüklenemedi.",
        ),
      );
    };

    xhr.onload = () => {
      const status = xhr.status;
      if (status === 201 || status === 200) {
        try {
          const payload = JSON.parse(xhr.responseText) as
            | { data?: MediaAsset; error?: { code: string; message: string } };
          if (payload.data) {
            resolve(payload.data);
            return;
          }
          // Some clients may omit the envelope and return the asset
          // directly — tolerate that shape.
          if (!payload.error) {
            resolve(payload as unknown as MediaAsset);
            return;
          }
        } catch {
          // fall through to error
        }
        reject(
          new AdminApiError(
            status,
            "media.invalid_response",
            "Sunucu beklenmeyen bir yanıt döndü.",
          ),
        );
        return;
      }
      // 4xx / 5xx — try to surface the structured error envelope.
      let code = "media.upload_failed";
      let message = `Yükleme başarısız (HTTP ${status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as {
          error?: { code: string; message: string };
        };
        if (body.error) {
          code = body.error.code || code;
          message = body.error.message || message;
        }
      } catch {
        // body wasn't JSON — keep generic message
      }
      reject(new AdminApiError(status, code, message));
    };

    xhr.send(formData);
  });
}