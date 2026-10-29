import { clerk } from "@clerk/testing/playwright";
import { expect, test as base, type Page } from "@playwright/test";

const USER_EMAIL = process.env.E2E_CLERK_USER_EMAIL ?? "pageindex-e2e+clerk_test@example.com";

/** Matches `playwright.config.ts`; renewed sessions are written back here. */
const AUTH_STATE = "e2e/.auth/user.json";

/**
 * Renew the session when it has expired, before the test starts.
 *
 * A Clerk development instance issues a 60-second session JWT and no refresh
 * cookie (`session-token-expired-refresh-non-eligible-no-refresh-cookie`), so a
 * suite that outlives the token starts answering `/api/*` with a sign-in
 * redirect — `page.request` calls then try to parse HTML as JSON, and loading a
 * page does not revive it. Minting a new session is the only thing that does.
 *
 * A signed-out spec opts out by having no session cookie at all, which is what
 * `auth.spec.ts` relies on.
 */
/** Seconds left on the shortest session token, or null when there is none. */
async function sessionSecondsLeft(page: Page): Promise<number | null> {
  const cookies = (await page.context().cookies()).filter((cookie) =>
    cookie.name.startsWith("__session"),
  );
  if (cookies.length === 0) return null;

  const now = Date.now() / 1000;
  let shortest = Number.POSITIVE_INFINITY;
  for (const cookie of cookies) {
    const payload = cookie.value.split(".")[1];
    if (!payload) continue;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (typeof claims.exp === "number") shortest = Math.min(shortest, claims.exp - now);
    } catch {
      /* an opaque token cannot be dated, so it is never treated as stale */
    }
  }
  return Number.isFinite(shortest) ? shortest : null;
}

/**
 * Renew the session before a test outlives it.
 *
 * A Clerk development instance issues a 60-second session JWT and no refresh
 * cookie, and clerk-js does not renew it either — the expiry simply counts down
 * while pages are open. So a suite longer than a minute starts answering
 * `/api/*` with a sign-in redirect, and `page.request` calls try to parse the
 * sign-in page as JSON.
 *
 * Clearing the cookies is what makes a new sign-in possible: with the old
 * session still in the jar, `clerk.signIn` refuses ("You're already signed in").
 * A spec that starts signed out has no session cookie and is left alone, which
 * is what `auth.spec.ts` relies on.
 */
async function renewExpiredSession(page: Page): Promise<void> {
  const left = await sessionSecondsLeft(page);
  if (left === null || left > 20) return;

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: USER_EMAIL });

  // Each test gets its own context, seeded from the file the setup project wrote.
  // Without writing the renewed session back, every test would renew again.
  await page.context().storageState({ path: AUTH_STATE });
}

/**
 * Shared test fixture: every page fails the test if it reports a CSP violation
 * or a hydration mismatch.
 *
 * A Content Security Policy is only as good as what it does not break, and the
 * failures are silent in a screenshot — a blocked script or image just does not
 * appear. Listening on the console turns "the policy is too tight" into a
 * failing test with the refused source in the message.
 *
 * Hydration deserves the same treatment and did not have it: React recovers from
 * a mismatched tree by re-rendering it, so a page can look correct while the
 * server and client disagreed about the markup.
 *
 * Both wordings are matched because the suite runs a production build
 * (`next start`): development prints "Hydration failed because …" and
 * "… cannot be a descendant of …", production prints `Minified React error #42x`.
 * The codes are React's hydration family — 418/419/421/422/423/425.
 *
 * What this cannot see, verified by reverting a fix and watching a production
 * build stay silent: a *structural* mismatch. `<figure>` inside `<p>` leaves the
 * invalid tree in place with no console output and no thrown error at all. Those
 * are asserted on the DOM where they matter, e.g. the reader spec's
 * `p figure, p div` count.
 *
 * One case is deliberately excluded: a mismatch at the document element
 * (`args[]=HTML`). CI reported it once on a reload with no component implicated,
 * in a DOM whose `<head>` script count and `<body>` child count vary between
 * reloads — clerk-js and sonner inject nodes, and whichever lands mid-hydration
 * regenerates the tree. That is not attributable to our components, and it is not
 * the class of bug this guard exists for. Every other mismatch is fatal.
 */
const CSP_MESSAGE = /Content Security Policy|Refused to (load|execute|apply|connect|frame)/i;
const HYDRATION_MESSAGE =
  /Minified React error #(418|419|421|422|423|425)\b|hydration|cannot be a descendant of|cannot contain a nested/i;
const DOCUMENT_LEVEL = /args\[\]=HTML/;

export const test = base.extend({
  page: async ({ page }, use) => {
    const csp: string[] = [];
    const hydration: string[] = [];

    page.on("console", (message) => {
      const text = message.text();
      if (CSP_MESSAGE.test(text)) csp.push(text);
      if (HYDRATION_MESSAGE.test(text) && !DOCUMENT_LEVEL.test(text)) hydration.push(text);
    });

    // Production reports a mismatch by throwing a recoverable error rather than
    // logging one: a mutated text node surfaces only here, as `Minified React
    // error #418`. The console listener alone would be dead code.
    page.on("pageerror", (error) => {
      if (HYDRATION_MESSAGE.test(error.message) && !DOCUMENT_LEVEL.test(error.message)) {
        hydration.push(error.message);
      }
    });

    await renewExpiredSession(page);

    // Playwright's fixture callback, not a React hook — the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    // Two assertions, not one: a failure has to say which policy was broken.
    expect(csp, `CSP violations:\n${csp.join("\n")}`).toEqual([]);
    expect(hydration, `hydration errors:\n${hydration.join("\n")}`).toEqual([]);
  },
});

export { expect };
