/**
 * The Frontend API origin a Clerk publishable key points at.
 *
 * `pk_test_<base64("host$")>` / `pk_live_<base64("host$")>` — decoding it keeps
 * the CSP honest across instances (a development instance lives on
 * `*.clerk.accounts.dev`, production on a custom domain) without a second
 * configuration value that could drift.
 *
 * Returns null when the key is missing or malformed; callers then omit Clerk's
 * origins entirely rather than allowing a wildcard.
 */
export function clerkFrontendApi(publishableKey: string | undefined): string | null {
  if (!publishableKey) return null;

  const encoded = publishableKey.split("_").slice(2).join("_");
  if (!encoded) return null;

  try {
    // `atob` rather than Buffer: this runs in the proxy, whose runtime is not
    // guaranteed to be Node.
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const host = atob(base64).replace(/\$$/, "").trim();
    // A hostname, not a full URL: reject anything that could smuggle a path.
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}
