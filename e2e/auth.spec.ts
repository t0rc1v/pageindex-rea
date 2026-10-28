import { expect, test } from "./fixtures";

/**
 * Signed-out behaviour, in a context that shares nothing with the signed-in
 * projects.
 *
 * A Clerk development instance has two origins: the Frontend API from the
 * publishable key (`<slug>.clerk.accounts.dev`) and the Account Portal
 * (`<slug>.accounts.dev`, advertised by the instance's `display_config`). The
 * CSP can only allow the first, because it is derived from the key, so a URL
 * that falls back to the portal is both a wrong destination and a guaranteed
 * console violation. Both tests below fail if the sign-in URL stops coming from
 * `proxy.ts` / `ClerkProvider` and starts coming from the instance again.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("signed-out auth", () => {
  test("a protected route redirects to this app's own sign-in", async ({ page, baseURL }) => {
    await page.goto("/library");

    await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);

    const url = new URL(page.url());
    const origin = new URL(baseURL!).origin;
    expect(url.origin, "the portal would answer on another origin").toBe(origin);
    expect(url.searchParams.get("redirect_url")).toBe(`${origin}/library`);
  });

  test("the sign-in page never reaches the Account Portal", async ({ page, baseURL }) => {
    const hosts = new Set<string>();
    page.on("request", (request) => {
      try {
        hosts.add(new URL(request.url()).host);
      } catch {
        /* data: and blob: URLs have no host */
      }
    });

    await page.goto("/sign-in");
    await page.waitForTimeout(3_000);

    // `<slug>.accounts.dev` is the portal; `<slug>.clerk.accounts.dev` is the
    // Frontend API, which the CSP allows and clerk-js must be able to call.
    const portalHosts = [...hosts].filter(
      (host) => host.endsWith(".accounts.dev") && !host.endsWith(".clerk.accounts.dev"),
    );
    expect(portalHosts, "clerk-js resolved the Clerk Account Portal").toEqual([]);

    // Without this the assertion above would also pass on a page where clerk-js
    // never loaded at all.
    expect([...hosts], "clerk-js should still call the Frontend API").toContainEqual(
      expect.stringMatching(/\.clerk\.accounts\.dev$/),
    );

    const origin = new URL(baseURL!).origin;
    expect(page.url()).toBe(`${origin}/sign-in`);
  });
});
