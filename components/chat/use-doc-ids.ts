"use client";

import { useCallback } from "react";

import type { Citation } from "@/lib/pageindex/types";
import type { ChatDoc } from "./use-chat";

/**
 * Turning a citation's document name into an id.
 *
 * Both surfaces need it — a citation chip renders before the answer's citations
 * frame lands, and a tool step names its document in prose — so the rule lives
 * here rather than in whichever surface happens to be on screen.
 */

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|md|txt)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function useDocIds(chat: { docs: ChatDoc[]; library: ChatDoc[] }) {
  const resolveDocId = useCallback(
    (name: string | undefined): string | undefined => {
      if (!name) return undefined;
      const pool = [...chat.library, ...chat.docs];
      const exact = pool.find((doc) => doc.name === name);
      if (exact) return exact.id;
      const needle = normalized(name);
      return pool.find((doc) => normalized(doc.name) === needle)?.id;
    },
    [chat.docs, chat.library],
  );

  /**
   * A citation gets its doc id when the answer's citations frame is merged. A
   * preview opened before that — the frame lands after the text finishes — would
   * hold an unfilled citation and report "outside the current scope" for the
   * document the user is looking at, so the id is resolved from the name here.
   */
  const withDocId = useCallback(
    (citation: Citation): Citation =>
      citation.docId ? citation : { ...citation, docId: resolveDocId(citation.document) },
    [resolveDocId],
  );

  return { resolveDocId, withDocId };
}
