import { describe, expect, it } from "vitest";

import { clerkFrontendApi } from "./clerk-frontend-api";

const key = (host: string) =>
  `pk_test_${Buffer.from(`${host}$`, "utf8").toString("base64")}`;

describe("clerkFrontendApi", () => {
  it("decodes the instance host from a publishable key", () => {
    expect(clerkFrontendApi(key("direct-halibut-6675.clerk.accounts.dev"))).toBe(
      "https://direct-halibut-6675.clerk.accounts.dev",
    );
    expect(clerkFrontendApi(key("clerk.acme.com"))).toBe("https://clerk.acme.com");
  });

  it("handles live keys the same way", () => {
    expect(clerkFrontendApi(`pk_live_${Buffer.from("clerk.acme.com$").toString("base64")}`)).toBe(
      "https://clerk.acme.com",
    );
  });

  it("returns null rather than guessing", () => {
    expect(clerkFrontendApi(undefined)).toBeNull();
    expect(clerkFrontendApi("")).toBeNull();
    expect(clerkFrontendApi("pk_test")).toBeNull();
    // A decoded value that is not a bare hostname must not become a CSP source.
    expect(
      clerkFrontendApi(`pk_test_${Buffer.from("evil.com; script-src *$").toString("base64")}`),
    ).toBeNull();
  });
});
