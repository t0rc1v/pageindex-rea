import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { clerkFrontendApi } from "@/lib/clerk-frontend-api";

/**
 * Session reading only — every page and Route Handler calls `auth.protect()`
 * itself, because a URL matcher cannot see Server Functions or the paths Next
 * normalizes differently. `createRouteMatcher` is deprecated in @clerk/nextjs 7.
 *
 * `/api/webhooks/*` is excluded on purpose. Clerk delivers webhooks without a
 * session, and in development `clerkMiddleware` answers a session-less *document*
 * request with a handshake redirect, which would turn every delivery into a 307
 * before the signature check ran.
 *
 * ## Content Security Policy
 *
 * Deliberately **not** nonce-based. A nonce can only be injected while a page is
 * rendered per request, and this app is built on Cache Components: routes are
 * partial prerenders, so their static shell is generated at build time with no
 * request and no nonce. Clerk's `contentSecurityPolicy` helper generates a nonce,
 * which is exactly why enabling it blocked every Next chunk here — the browser
 * ignores `'unsafe-inline'` once a nonce is present. The choice was a strict
 * nonce policy or PPR, not both; PPR is the point of the architecture.
 *
 * What is enforced instead: no external script origins beyond our own bundle and
 * Clerk's Frontend API; no `object`, `base` or framing tricks; tightly listed
 * `connect-src` and `img-src` (presigned S3, Clerk avatars, local mock). Inline
 * scripts remain allowed, which is the trade — React escapes by default, the one
 * `dangerouslySetInnerHTML` renders mermaid output with `securityLevel: "strict"`,
 * and an XSS could still execute script, but could not exfiltrate it anywhere.
 */

const isProduction = process.env.NODE_ENV === "production";

const clerkApi = clerkFrontendApi(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Only present when the app points at a plain-HTTP upstream (mock or local). */
const upstreamApi = (process.env.PAGEINDEX_API_URL ?? "").replace(/\/+$/, "");
const localUpstream = upstreamApi.startsWith("http://") ? new URL(upstreamApi).origin : null;

const directives: Array<[string, string[]]> = [
  ["default-src", ["'self'"]],
  [
    "script-src",
    [
      "'self'",
      // Next's inline bootstrap and the per-route flight payload.
      "'unsafe-inline'",
      // React's development-only eval-based debugging.
      ...(isProduction ? [] : ["'unsafe-eval'"]),
      ...(clerkApi ? [clerkApi, "https://*.protect.clerk.com:*"] : []),
    ],
  ],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  [
    "img-src",
    [
      "'self'",
      "data:",
      // Diagram export and figure rasterisation go through object URLs.
      "blob:",
      "https://img.clerk.com",
      // Presigned page renders and figures live in the PageIndex S3 bucket;
      // the wildcard covers both the path-style and region-qualified hosts.
      "https://*.amazonaws.com",
      ...(localUpstream ? [localUpstream] : []),
    ],
  ],
  [
    "connect-src",
    [
      "'self'",
      ...(clerkApi
        ? [
            clerkApi,
            // Bot protection probes several ports, so the host wildcard alone is
            // not enough — CSP matches the port too.
            "https://*.protect.clerk.com:*",
            "https://clerk-telemetry.com",
          ]
        : []),
      // Next's HMR socket in development.
      ...(isProduction ? [] : ["ws:", "wss:"]),
    ],
  ],
  ["font-src", ["'self'", "data:"]],
  ["worker-src", ["'self'", "blob:"]],
  [
    "frame-src",
    [
      "'self'",
      "https://challenges.cloudflare.com",
      ...(clerkApi ? ["https://*.protect.clerk.com:*"] : []),
    ],
  ],
  ["media-src", ["'self'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
];

const contentSecurityPolicy = directives
  .map(([directive, values]) => `${directive} ${values.join(" ")}`)
  .join("; ");

const withClerk = clerkMiddleware();

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = (await withClerk(request, event)) ?? NextResponse.next();

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/((?!api/webhooks)(?:api|trpc))(.*)",
  ],
};
