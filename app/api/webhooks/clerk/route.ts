import { headers } from "next/headers";
import { Webhook } from "svix";

import {
  deleteOrganization,
  deleteUser,
  upsertOrganization,
  upsertUser,
  type ClerkOrganizationPayload,
  type ClerkUserPayload,
} from "@/lib/server/clerk-sync";
import { jsonResponse } from "@/lib/server/http";

/**
 * POST /api/webhooks/clerk — keeps the Postgres mirror in step with Clerk.
 *
 * This route is intentionally *not* behind `auth.protect()`: Clerk delivers it
 * as a machine, and the signature is the authentication. Without
 * `CLERK_WEBHOOK_SIGNING_SECRET` the endpoint answers 503 rather than accepting
 * unsigned payloads.
 *
 * Configure it in the Clerk Dashboard (Webhooks → Add endpoint) pointing at
 * `/api/webhooks/clerk`, and subscribe to `user.created`, `user.updated`,
 * `user.deleted`, `organization.created`, `organization.updated`,
 * `organization.deleted`.
 */

interface ClerkEvent {
  type: string;
  data: unknown;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!secret) {
    return jsonResponse(
      {
        error:
          "Clerk webhooks are not configured. Set CLERK_WEBHOOK_SIGNING_SECRET and add the endpoint in the Clerk Dashboard.",
        code: "INTERNAL",
        status: 503,
      },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const incoming = await headers();

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": incoming.get("svix-id") ?? "",
      "svix-timestamp": incoming.get("svix-timestamp") ?? "",
      "svix-signature": incoming.get("svix-signature") ?? "",
    }) as unknown as ClerkEvent;
  } catch {
    // Signature mismatch, stale timestamp, or a missing header.
    return jsonResponse({ error: "Invalid webhook signature.", code: "INTERNAL", status: 401 }, { status: 401 });
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated":
        await upsertUser(event.data as ClerkUserPayload);
        break;
      case "user.deleted": {
        const userId = (event.data as { id?: string }).id;
        if (userId) await deleteUser(userId);
        break;
      }
      case "organization.created":
      case "organization.updated":
        await upsertOrganization(event.data as ClerkOrganizationPayload);
        break;
      case "organization.deleted": {
        const organizationId = (event.data as { id?: string }).id;
        if (organizationId) await deleteOrganization(organizationId);
        break;
      }
      default:
        // Unsubscribed events still get a 2xx: Clerk retries non-2xx deliveries.
        break;
    }
  } catch (error) {
    // A 500 asks Clerk to retry, which is what we want for a transient DB error.
    console.error("clerk webhook", event.type, error);
    return jsonResponse(
      { error: "Could not apply the webhook.", code: "INTERNAL", status: 500 },
      { status: 500 },
    );
  }

  return jsonResponse({ ok: true });
}
