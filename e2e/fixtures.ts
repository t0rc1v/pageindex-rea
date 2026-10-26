import { expect, test as base } from "@playwright/test";

/**
 * Shared test fixture: every page fails the test if it reports a CSP violation.
 *
 * A Content Security Policy is only as good as what it does not break, and the
 * failures are silent in a screenshot — a blocked script or image just does not
 * appear. Listening on the console turns "the policy is too tight" into a
 * failing test with the refused source in the message.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const violations: string[] = [];

    page.on("console", (message) => {
      const text = message.text();
      if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(text)) {
        violations.push(text);
      }
    });

    // Playwright's fixture callback, not a React hook — the lint rule cannot tell.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);

    expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
  },
});

export { expect };
