"use client";

import Link from "next/link";

import { useFetch } from "@/lib/client/hooks";
import { useChats } from "@/lib/client/use-chats";
import { clearChats } from "@/lib/chat-store";
import { Button, Panel, Skeleton, cn } from "@/components/ui-kit";

interface ConfigPayload {
  configured: boolean;
  apiUrl: string;
  betaHeaders: string[];
  lane: "mcp" | "managed";
  model: string | null;
  mcpUrl: string;
}

export function SettingsView() {
  const config = useFetch<ConfigPayload>("/api/config");
  const chats = useChats();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-5 py-6">
        <h1 className="font-serif text-xl text-ink">Settings</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          This reader talks to PageIndex Cloud with a server-side key. There is no
          account system here: one key, one library, conversations kept in this
          browser.
        </p>

        <Section title="PageIndex connection">
          {config.loading && !config.data ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-56" />
              <Skeleton className="h-3.5 w-72" />
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-[140px_minmax(0,1fr)]">
              <dt className="text-ink-muted">API key</dt>
              <dd>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                    config.data?.configured
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-900",
                  )}
                >
                  {config.data?.configured ? "configured" : "missing"}
                </span>
                {!config.data?.configured && (
                  <span className="ml-2 text-ink-muted">
                    set <code className="font-mono">PAGEINDEX_API_KEY</code> in{" "}
                    <code className="font-mono">.env.local</code>
                  </span>
                )}
              </dd>
              <dt className="text-ink-muted">API base URL</dt>
              <dd className="font-mono text-[11.5px] break-all">{config.data?.apiUrl ?? "—"}</dd>
              <dt className="text-ink-muted">Upload beta headers</dt>
              <dd className="font-mono text-[11.5px]">
                {config.data?.betaHeaders.length ? config.data.betaHeaders.join(", ") : "none"}
              </dd>
            </dl>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <a
              href="https://dash.pageindex.ai"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
            >
              Manage API keys
            </a>
            <a
              href="https://docs.pageindex.ai/api-reference"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
            >
              API reference
            </a>
          </div>
        </Section>

        <Section title="Conversations">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {chats.length === 0
              ? "No conversations stored yet."
              : `${chats.length} conversation${chats.length === 1 ? "" : "s"} stored in this browser (localStorage).`}
          </p>
          <div className="mt-3 flex gap-1.5">
            <Button
              size="sm"
              variant="danger"
              disabled={chats.length === 0}
              onClick={() => {
                if (window.confirm("Delete all locally stored conversations?")) clearChats();
              }}
            >
              Clear conversations
            </Button>
            <Link
              href="/library"
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
            >
              Manage documents
            </Link>
          </div>
        </Section>

        <Section title="Chat lane">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                config.data?.lane === "mcp"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-line bg-paper text-ink-muted",
              )}
            >
              {config.data?.lane === "mcp"
                ? `MCP tools · ${config.data.model ?? "model"}`
                : "Managed chat (legacy endpoint)"}
            </span>
          </div>

          {config.data?.lane === "mcp" ? (
            <>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                Your model drives PageIndex&apos;s MCP tools through{" "}
                <code className="font-mono text-[11px] break-all">{config.data.mcpUrl}</code>.
                It reads the document tree and pages itself, then writes{" "}
                <code className="font-mono text-[11px]">&lt;cite …/&gt;</code> tags that this
                app turns into numbered citations with block bounding boxes.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                Remove <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to fall
                back to the managed endpoint, where PageIndex runs the agent instead.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                No model key is configured, so answers come from PageIndex&apos;s managed
                chat endpoint (<code className="font-mono text-[11px]">POST /chat/completions/</code>)
                — the legacy Chat API. It still returns numbered citations with block
                bounding boxes, but PageIndex runs the retrieval agent.
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                Add <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to switch to
                the recommended MCP lane, where your own model drives the retrieval.
              </p>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a
              href="https://docs.pageindex.ai/mcp"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
            >
              MCP setup
            </a>
            <a
              href="https://docs.pageindex.ai/sdk/chat"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
            >
              Chat + citations
            </a>
          </div>
        </Section>

        <Section title="Shortcuts">
          <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
            <li>
              <Key>Enter</Key> send · <Key>Shift</Key>+<Key>Enter</Key> new line
            </li>
            <li>
              <Key>←</Key> / <Key>→</Key> previous / next page in the reader
            </li>
            <li>
              <Key>Esc</Key> close a citation preview
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="mt-4 p-4">
      <h2 className="mb-2 font-serif text-[15px] text-ink">{title}</h2>
      {children}
    </Panel>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[10px] text-ink">
      {children}
    </kbd>
  );
}
