import { PageIndexError, hasApiKey } from "../pageindex/client";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export interface ApiErrorBody {
  error: string;
  code: "MISSING_API_KEY" | "UNAUTHORIZED" | "NOT_FOUND" | "UPSTREAM" | "INTERNAL";
  status: number;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PageIndexError) {
    const code: ApiErrorBody["code"] =
      !hasApiKey() || error.status === 401 || error.status === 403
        ? "MISSING_API_KEY"
        : error.status === 404
          ? "NOT_FOUND"
          : "UPSTREAM";
    const body: ApiErrorBody = {
      error: error.message,
      code,
      status: error.status,
    };
    return jsonResponse(body, { status: error.status >= 400 ? error.status : 502 });
  }

  if (error instanceof DOMException && error.name === "TimeoutError") {
    const body: ApiErrorBody = {
      error: "The PageIndex API did not respond in time. Try again.",
      code: "UPSTREAM",
      status: 504,
    };
    return jsonResponse(body, { status: 504 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const body: ApiErrorBody = { error: message, code: "INTERNAL", status: 500 };
  return jsonResponse(body, { status: 500 });
}

/** Parse an integer query parameter with bounds. */
export function intParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}
