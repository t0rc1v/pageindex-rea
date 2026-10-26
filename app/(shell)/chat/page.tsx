import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

import { NewChatRoute } from "@/components/chat/new-chat-route";
import { Spinner } from "@/components/ui-kit";

export const metadata = { title: "New chat — PageIndex Reader" };

export default async function NewChatPage() {
  await auth.protect();

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-ink-muted">
          <Spinner /> Preparing chat…
        </div>
      }
    >
      <NewChatRoute />
    </Suspense>
  );
}
