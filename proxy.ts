import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Session reading only — every page and Route Handler calls `auth.protect()`
 * itself, because a URL matcher cannot see Server Functions or the paths Next
 * normalizes differently. `createRouteMatcher` is deprecated in @clerk/nextjs 7.
 *
 * `/api/webhooks/*` is excluded on purpose. Clerk delivers webhooks without a
 * session, and in development `clerkMiddleware` answers a session-less *document*
 * request with a handshake redirect, which would turn every delivery into a 307
 * before the signature check ran.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/((?!api/webhooks)(?:api|trpc))(.*)",
  ],
};
