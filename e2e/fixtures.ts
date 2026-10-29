import { expect, test as base } from "@playwright/test";

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
 */
const CSP_MESSAGE = /Content Security Policy|Refused to (load|execute|apply|connect|frame)/i;
const HYDRATION_MESSAGE =
  /hydration|cannot be a descendant of|cannot contain a nested|Minified React error #(418|419|421|422|423|425)\b/i;

export const test = base.extend({
  page: async ({ page }, use) => {
    const csp: string[] = [];
    const hydration: string[] = [];

    page.on("console", (message) => {
      const text = message.text();
      if (CSP_MESSAGE.test(text)) csp.push(text);
      if (HYDRATION_MESSAGE.test(text)) hydration.push(text);
    });

    // Production reports a mismatch by throwing a recoverable error rather than
    // logging one: a mutated text node surfaces only here, as `Minified React
    // error #418`. The console listener alone would be dead code.
    page.on("pageerror", (error) => {
      if (HYDRATION_MESSAGE.test(error.message)) hydration.push(error.message);
    });

    // Playwright's fixture callback, not a React hook — the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    // Two assertions, not one: a failure has to say which policy was broken.
    expect(csp, `CSP violations:\n${csp.join("\n")}`).toEqual([]);
    expect(hydration, `hydration errors:\n${hydration.join("\n")}`).toEqual([]);
  },
});

export { expect };
