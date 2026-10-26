"use client";

import { useIsClient } from "@/lib/client/hooks";
import { Skeleton } from "@/components/ui-kit";
import { ChatWorkspace } from "./chat-workspace";

/**
 * Stored conversations are fetched per browser session, so this surface mounts
 * only after hydration — otherwise the server and client would render different
 * message lists. `key` forces a fresh workspace per chat, which is what makes
 * the "loading" state correct when navigating between conversations.
 */
export function ChatPageClient({ chatId }: { chatId: string }) {
  const isClient = useIsClient();

  if (!isClient) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-11/12" />
      </div>
    );
  }

  return <ChatWorkspace key={chatId} chatId={chatId} />;
}
