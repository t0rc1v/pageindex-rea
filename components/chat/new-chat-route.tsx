"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { DocumentListResponse } from "@/lib/pageindex/types";
import { Skeleton } from "@/components/ui-kit";
import { ChatWorkspace } from "./chat-workspace";

/**
 * `/chat` — a new conversation, optionally pre-scoped by `?docs=id,id`
 * (from a library selection or a document's "Chat" action).
 */
export function NewChatRoute() {
  const params = useSearchParams();
  const ids = useMemo(
    () =>
      (params.get("docs") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [params],
  );

  const docs = useFetch<DocumentListResponse>(ids.length > 0 ? "/api/docs?limit=200" : null);

  const initialDocs = useMemo(
    () =>
      ids.map((id) => ({
        id,
        name: docs.data?.documents.find((doc) => doc.id === id)?.name ?? id,
      })),
    [ids, docs.data],
  );

  // Wait for names so the scope chip never shows raw ids.
  if (ids.length > 0 && docs.loading && !docs.data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-8 w-72" />
        <Skeleton className="mt-6 h-20 w-full" />
      </div>
    );
  }

  return <ChatWorkspace initialDocs={initialDocs} />;
}
