"use client";

import Link from "next/link";

import { useFetch } from "@/lib/client/hooks";
import { useChats, useChatsStatus } from "@/lib/client/use-chats";
import { clearChats } from "@/lib/chat-store";
import { useAppearance } from "@/components/providers";
import { useConfirm } from "@/components/ui/confirm";
import { Button, Panel, Skeleton, cn } from "@/components/ui-kit";
import { toast } from "sonner";

interface ConfigPayload {
  configured: boolean;
  apiUrl: string;
  betaHeaders: string[];
  lane: "mcp" | "managed";
  model: string | null;
  mcpUrl: string;
}

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "connection", label: "Connection" },
  { id: "lane", label: "Chat lane" },
  { id: "data", label: "Conversations" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function SettingsView() {
  const config = useFetch<ConfigPayload>("/api/config");
  const chats = useChats();
  const chatsStatus = useChatsStatus();
  const confirm = useConfirm();
  const { appearance, setAppearance } = useAppearance();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        <h1 className="font-serif text-xl text-ink">Settings</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          This reader talks to PageIndex Cloud with a server-side key, so one key backs the
          whole upstream account. Documents are shared with your workspace; conversations
          are saved to your account and only you can see them.
        </p>

        <div className="mt-5 grid gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="hidden md:block">
            <ul className="sticky top-2 flex flex-col gap-0.5">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded-lg px-2 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0">
            <Section id="appearance" title="Appearance">
              <div className="flex flex-col gap-3">
                <Field
                  label="Theme"
                  hint="Dark follows the system unless you pin it."
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "system", label: "System" },
                  ]}
                  value={appearance.theme}
                  onChange={(value) => setAppearance({ theme: value as "light" | "dark" | "system" })}
                />
                <Field
                  label="Transcript type"
                  hint="Serif is the reading identity; sans matches the official column."
                  options={[
                    { value: "serif", label: "Serif" },
                    { value: "sans", label: "Sans" },
                  ]}
                  value={appearance.transcript}
                  onChange={(value) => setAppearance({ transcript: value as "serif" | "sans" })}
                />
                <Field
                  label="Density"
                  hint="Compact tightens the answer column."
                  options={[
                    { value: "comfortable", label: "Comfortable" },
                    { value: "compact", label: "Compact" },
                  ]}
                  value={appearance.density}
                  onChange={(value) =>
                    setAppearance({ density: value as "comfortable" | "compact" })
                  }
                />
              </div>
            </Section>

            <Section id="connection" title="PageIndex connection">
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
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
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
                  <dd className="break-all font-mono text-[11.5px]">{config.data?.apiUrl ?? "—"}</dd>
                  <dt className="text-ink-muted">Upload beta headers</dt>
                  <dd className="font-mono text-[11.5px]">
                    {config.data?.betaHeaders.length ? config.data.betaHeaders.join(", ") : "none"}
                  </dd>
                </dl>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <ExtLink href="https://dash.pageindex.ai">Manage API keys</ExtLink>
                <ExtLink href="https://docs.pageindex.ai/api-reference">API reference</ExtLink>
              </div>
            </Section>

            <Section id="lane" title="Chat lane">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                    config.data?.lane === "mcp"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
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
                    <code className="break-all font-mono text-[11px]">{config.data.mcpUrl}</code>.
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
                    chat endpoint (
                    <code className="font-mono text-[11px]">POST /chat/completions/</code>) — the
                    legacy Chat API. It still returns numbered citations with block bounding
                    boxes, but PageIndex runs the retrieval agent.
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                    Add <code className="font-mono text-[11px]">OPENAI_API_KEY</code> to switch to
                    the recommended MCP lane, where your own model drives the retrieval.
                  </p>
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <ExtLink href="https://docs.pageindex.ai/mcp">MCP setup</ExtLink>
                <ExtLink href="https://docs.pageindex.ai/sdk/chat">Chat + citations</ExtLink>
              </div>
            </Section>

            <Section id="data" title="Conversations">
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                {chatsStatus === "ready"
                  ? chats.length === 0
                    ? "No conversations yet."
                    : `${chats.length} conversation${chats.length === 1 ? "" : "s"} saved to your account, visible only to you.`
                  : chatsStatus === "error"
                    ? "Your conversations could not be loaded. Reload the page to try again."
                    : "Checking your conversations…"}
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                Conversations live on the server, so they follow you to another browser.
                Documents and their indexes are not affected by clearing them.
              </p>
              <div className="mt-3 flex gap-1.5">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={chats.length === 0}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: "Delete all conversations?",
                        description:
                          "Every conversation you started in this workspace is removed, for your account only. Documents and their indexes are untouched.",
                        confirmLabel: "Delete conversations",
                        tone: "danger",
                      });
                      if (!ok) return;
                      await clearChats();
                      toast.success("Conversations cleared");
                    })();
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

            <Section id="shortcuts" title="Shortcuts">
              <ul className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
                <li>
                  <Key>Enter</Key> send · <Key>Shift</Key>+<Key>Enter</Key> new line
                </li>
                <li>
                  <Key>⌘K</Key> jump to the composer
                </li>
                <li>
                  <Key>⌘B</Key> collapse / expand the sidebar
                </li>
                <li>
                  <Key>←</Key> / <Key>→</Key> previous / next page in the reader and panel
                </li>
                <li>
                  <Key>Esc</Key> close a citation preview or dialog
                </li>
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink">{label}</p>
        {hint && <p className="text-[11px] leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      <div className="flex items-center rounded-lg border border-line bg-paper p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 text-[11.5px] transition-colors",
              value === option.value ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Panel className="mt-4 scroll-mt-4 p-4 first:mt-0" >
      <h2 id={id} className="mb-2 font-serif text-[15px] text-ink">
        {title}
      </h2>
      {children}
    </Panel>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[11.5px] text-ink hover:bg-paper"
    >
      {children}
    </a>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-paper px-1 py-0.5 font-mono text-[10px] text-ink">
      {children}
    </kbd>
  );
}
