import { PageIndexError, hasApiKey } from "../pageindex/client";

/**
 * A request that was abandoned, rather than one that failed.
 *
 * Abandonment arrives in several shapes: `fetch` rejects with a `DOMException`
 * named `AbortError` on Node's undici, a socket that died mid-request surfaces
 * as `Error: aborted` with `ECONNRESET`, and Next wraps some of them. All of
 * them mean the same thing here — nobody is waiting for an answer.
 */
function isAbandoned(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const { name, code, message } = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  if (name === "AbortError") return true;
  if (code === "ECONNRESET" || code === "ECONNABORTED") return true;
  return typeof message === "string" && message.trim().toLowerCase() === "aborted";
}

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

  /**
   * The caller hung up — a reader turned the page, a panel closed, a navigation
   * replaced the route. Nothing went wrong and nobody is listening, so this is
   * neither an error to log nor a 500 to report; 499 is nginx's name for it.
   */
  if (isAbandoned(error)) {
    return new Response(null, { status: 499, headers: NO_STORE });
  }

  // Anything not modelled above is an internal failure: log it, but do not echo
  // driver messages (table names, constraint names, connection strings) to the
  // caller.
  console.error("unhandled route error", error);
  const body: ApiErrorBody = {
    error: "Something went wrong on our side. Try again.",
    code: "INTERNAL",
    status: 500,
  };
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
