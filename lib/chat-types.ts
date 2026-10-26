/**
 * Shapes shared by the browser store and the Postgres schema.
 *
 * These used to live in `lib/chat-store.ts`, which is a `"use client"` module.
 * The Drizzle tables need the same shapes for typed `jsonb` columns, and a
 * server file importing a client module — even for types — reads as a lie, so
 * the data model lives here and both sides import it.
 */

export interface DocRef {
  id: string;
  name: string;
}

export interface StoredCitation {
  document: string;
  page: number;
  blockId?: string;
  blockType?: string;
  bbox?: [number, number, number, number];
  docId?: string;
}

export interface StoredTool {
  /** Stable per-run id so a later stop event can address its own start. */
  id?: string;
  name: string;
  status: "start" | "stop" | "error";
  args?: unknown;
  /** Present on the MCP lane, which returns real tool payloads. */
  result?: unknown;
  at?: number;
}

/** Wall-clock timings, used for the collapsed "Thought for Ns" row. */
export interface TurnTimings {
  startedAt: number;
  firstTokenAt?: number;
  finishedAt?: number;
}

/**
 * One response. Regenerate appends a sibling run instead of overwriting, so the
 * previous answer stays reachable behind the branch control.
 */
export interface StoredRun {
  blocks: Record<number, string>;
  citations: StoredCitation[];
  tools: StoredTool[];
  error?: string;
  timings?: TurnTimings;
  /**
   * Assistant runs only: the index of the question version (in the preceding
   * user turn) this answer replied to. Editing a question appends a version and
   * asks it again, so answers and questions pair up by index, not by position.
   */
  questionRun?: number;
}

export interface StoredTurn {
  id: string;
  role: "user" | "assistant";
  /** Assistants: one per regeneration. Users: one per edit of the question. */
  runs: StoredRun[];
  activeRun: number;
  feedback?: "up" | "down";
  /** Documents in scope when the question was asked. */
  docs?: DocRef[];
}

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  docIds: string[];
  docs: DocRef[];
  turns: StoredTurn[];
}
