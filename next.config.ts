import type { NextConfig } from "next";

/**
 * Baseline response hardening. Deliberately not a full CSP: Clerk's Frontend API
 * origin varies per instance, and a wrong `script-src` here breaks sign-in with
 * no useful error. Clerk ships a CSP helper on `clerkMiddleware()` for the day
 * this app needs one.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Ignored over plain HTTP (localhost), which is exactly where it should be.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * The dev server allows `localhost` out of the box, but the e2e baseURL and
   * anything that resolves the app by address use `127.0.0.1`. Without this the
   * HMR socket is answered with a cross-origin block, so every page logs
   * `net::ERR_INVALID_HTTP_RESPONSE` and edits need a manual reload.
   */
  allowedDevOrigins: ["127.0.0.1"],
  /**
   * `/` is a pure redirect. Doing it here instead of with `redirect()` inside a
   * page keeps the segment out of the render tree: under Cache Components a
   * thrown `NEXT_REDIRECT` during static-shell validation surfaces as
   * "Could not validate `instant`" in the browser console on every visit.
   */
  async redirects() {
    return [{ source: "/", destination: "/chat", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
