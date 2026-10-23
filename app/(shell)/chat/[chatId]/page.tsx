import { Suspense } from "react";

import { ChatPageClient } from "@/components/chat/chat-page-client";
import { Skeleton } from "@/components/ui-kit";

export const metadata = { title: "Chat — PageIndex Reader" };

export default function ChatPage({ params }: PageProps<"/chat/[chatId]">) {
  return (
    <Suspense fallback={<ChatFallback />}>
      {params.then(({ chatId }) => (
        <ChatPageClient chatId={chatId} />
      ))}
    </Suspense>
  );
}

function ChatFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-11/12" />
    </div>
  );
}
