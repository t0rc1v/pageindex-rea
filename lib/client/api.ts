"use client";

export interface ApiErrorPayload {
  error: string;
  code?: string;
  status?: number;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "INTERNAL", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  get isMissingKey() {
    return this.code === "MISSING_API_KEY";
  }
}

async function toError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // non-JSON error body
  }
  return new ApiError(
    payload?.error ?? `Request failed (${response.status})`,
    payload?.code ?? "INTERNAL",
    payload?.status ?? response.status,
  );
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "DELETE" | "PUT" | "PATCH",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiUpload<T>(form: FormData): Promise<T> {
  const response = await fetch("/api/upload", {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

/**
 * Upload with progress. `fetch` still cannot report request progress, so this
 * one path uses XHR; the payload shape and error mapping stay identical.
 */
export function apiUploadWithProgress<T>(
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new ApiError("Upload failed", "INTERNAL", 0));
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        /* non-JSON body */
      }
      if (request.status < 200 || request.status >= 300) {
        const body = payload as ApiErrorPayload | null;
        reject(
          new ApiError(
            body?.error ?? `Upload failed (${request.status})`,
            body?.code ?? "INTERNAL",
            body?.status ?? request.status,
          ),
        );
        return;
      }
      onProgress?.(1);
      resolve(payload as T);
    };
    request.send(form);
  });
}
