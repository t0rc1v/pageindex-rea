import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { DocRef, StoredCitation, StoredTool, TurnTimings } from "@/lib/chat-types";

/**
 * Postgres schema for the parts the PageIndex Cloud API does not own.
 *
 * The Cloud key is account-wide: every document lives in one upstream account,
 * so access control cannot come from PageIndex itself. A *tenant* is therefore
 * the ownership boundary — a personal space for a solo reader, or a Clerk
 * Organization for a team — and every row below carries `tenant_id`.
 *
 * `tenant_id` is never nullable. A personal space is a real tenant row with a
 * null `clerk_org_id`; that keeps one code path for both cases instead of an
 * `isNull(orgId)` branch in every query.
 */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Clerk Organization id. Null marks the tenant as a personal space. */
  clerkOrgId: text("clerk_org_id").unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mirror of the Clerk user, so rows can be joined to a name and avatar without
 * a Backend API round trip per render. Clerk stays the source of truth; the
 * webhook (and the lazy upsert in `requireTenant`) keep this in step.
 */
export const users = pgTable(
  "users",
  {
    /** Clerk user id (`user_…`), not a local surrogate. */
    id: text("id").primaryKey(),
    email: text("email"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    imageUrl: text("image_url"),
    /**
     * The user's personal tenant. Unique, because a personal space has exactly
     * one member; team tenancy flows through `clerk_org_id` instead.
     */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_tenant_id_idx").on(t.tenantId)],
);

/**
 * Workspace folders — ours, not PageIndex's.
 *
 * The upstream `/folders` API is account-global: a folder created by one tenant
 * would be visible to (and mutable by) every other tenant. Folder organisation is
 * therefore local metadata, and uploads no longer send a `folder_id` upstream.
 */
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Nested folders are allowed by the model; the UI renders a flat list. */
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("folders_tenant_name_idx").on(t.tenantId, t.name)],
);

/**
 * Ownership registry for PageIndex documents.
 *
 * The upstream id is the one the BFF routes receive, so this table is what
 * turns `GET /api/docs/{id}` into "…and is it yours?".
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Document id in the PageIndex account. */
    pageindexId: text("pageindex_id").notNull(),
    /**
     * What this workspace calls the document. User-editable, never written to
     * PageIndex — the upstream name is an account-global key, so a rename there
     * would change another tenant's citations and break their MCP tool calls.
     */
    name: text("name").notNull(),
    /**
     * What PageIndex calls it. Read-only mirror: it is the argument its MCP tools
     * take and the name its citations carry, both of which are translated to
     * `name` before anything reaches the browser.
     */
    upstreamName: text("upstream_name").notNull(),
    /** Workspace folder. Null means unfiled ("root"). */
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    pageCount: integer("page_count"),
    description: text("description"),
    /** Upstream lifecycle: `processing`, `completed`, … as the API reports it. */
    status: text("status").notNull().default("completed"),
    /** When the row was last reconciled with upstream, so listing can throttle. */
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_tenant_pageindex_idx").on(t.tenantId, t.pageindexId),
    // Deleting asks "does any other tenant still reference this upstream id?",
    // which filters on the id alone and cannot use the composite above.
    index("documents_pageindex_idx").on(t.pageindexId),
    index("documents_tenant_folder_idx").on(t.tenantId, t.folderId, t.createdAt.desc()),
    index("documents_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export const chats = pgTable(
  "chats",
  {
    /**
     * A UUID the browser generates itself (crypto.randomUUID) rather than one the
     * database assigns: the id has to exist before the first save so `/chat/<id>`
     * can be in the address bar while the first answer streams.
     */
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Whose Recents list this appears in; the tenant may hold more members later. */
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Documents chosen for the whole conversation, mirroring the scope pill. */
    scopeDocs: jsonb("scope_docs").$type<DocRef[]>().notNull().default([]),
    /**
     * The document this conversation was started inside, if any.
     *
     * Deliberately not the same thing as `scopeDocs`: that is what the
     * conversation is *about*, and it can change per question. This is where it
     * was born, and it never changes afterwards. It is what keeps a chat out of
     * Recents and lists it under that document's Chat menu instead.
     *
     * Holds the **PageIndex id**, like `scopeDocs[].id` — one id space for
     * documents throughout the chat layer, and the value the reader already has
     * in its URL. That costs the cascade: `deleteDocument` deletes these rows
     * explicitly, which is the one place that can leave them orphaned.
     */
    originDocId: text("origin_doc_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Recents filters on both tenant and author, then orders by recency.
  (t) => [
    index("chats_tenant_author_updated_idx").on(t.tenantId, t.createdBy, t.updatedAt.desc()),
    // The per-document Chat menu asks the same question narrowed to one document.
    index("chats_tenant_author_origin_updated_idx").on(
      t.tenantId,
      t.createdBy,
      t.originDocId,
      t.updatedAt.desc(),
    ),
  ],
);

export const chatTurns = pgTable(
  "chat_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    /** 0-based order within the conversation; unique per chat. */
    position: integer("position").notNull(),
    /** Which of this turn's runs the transcript is showing. */
    activeRun: integer("active_run").notNull().default(0),
    feedback: text("feedback", { enum: ["up", "down"] }),
    /** Documents in scope when the question was asked. */
    docs: jsonb("docs").$type<DocRef[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_turns_chat_position_idx").on(t.chatId, t.position)],
);

/**
 * One attempt at answering a turn.
 *
 * Regenerate inserts a sibling row instead of overwriting, which is what keeps
 * the previous answer reachable behind the branch control. `blocks` is the
 * incrementally streamed text keyed by block index — stored as JSON because the
 * client patches single keys while a response streams.
 */
export const chatRuns = pgTable(
  "chat_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => chatTurns.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /**
     * Incrementally streamed text, keyed by block index. JSON keys are strings
     * on the wire, but every caller indexes with the numeric block id, so the
     * type says number and the runtime coercion does the rest.
     */
    blocks: jsonb("blocks").$type<Record<number, string>>().notNull().default({}),
    citations: jsonb("citations").$type<StoredCitation[]>().notNull().default([]),
    tools: jsonb("tools").$type<StoredTool[]>().notNull().default([]),
    error: text("error"),
    timings: jsonb("timings").$type<TurnTimings>(),
    /** Assistant runs: which question version this answered. */
    questionRun: integer("question_run"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_runs_turn_position_idx").on(t.turnId, t.position)],
);

/**
 * Fixed-window counters for the endpoints that cost real money upstream
 * (upload, chat, chat writes).
 *
 * This lives in Postgres rather than process memory on purpose: a per-instance
 * limiter silently multiplies every limit by the number of running instances,
 * which is exactly the failure mode a rate limit exists to prevent.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/** Lets `db.query.chats.findFirst({ with: { turns: { with: { runs: true } } } })` work. */
export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  folders: many(folders),
  documents: many(documents),
  chats: many(chats),
}));

export const usersRelations = relations(users, ({ one }) => ({
  personalTenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [folders.tenantId], references: [tenants.id] }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: "folder_parent",
  }),
  children: many(folders, { relationName: "folder_parent" }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, { fields: [documents.tenantId], references: [tenants.id] }),
  folder: one(folders, { fields: [documents.folderId], references: [folders.id] }),
  uploader: one(users, { fields: [documents.uploadedBy], references: [users.id] }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  tenant: one(tenants, { fields: [chats.tenantId], references: [tenants.id] }),
  author: one(users, { fields: [chats.createdBy], references: [users.id] }),
  turns: many(chatTurns),
}));

export const chatTurnsRelations = relations(chatTurns, ({ one, many }) => ({
  chat: one(chats, { fields: [chatTurns.chatId], references: [chats.id] }),
  runs: many(chatRuns),
}));

export const chatRunsRelations = relations(chatRuns, ({ one }) => ({
  turn: one(chatTurns, { fields: [chatRuns.turnId], references: [chatTurns.id] }),
}));
