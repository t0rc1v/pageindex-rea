"use client";

import { FilePlus2, FolderOpen, MessagesSquare } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { apiUploadWithProgress } from "@/lib/client/api";
import { Button, Spinner, cn } from "@/components/ui-kit";

const STEPS = [
  {
    icon: FilePlus2,
    title: "Upload documents",
    detail: "PDFs, Word, PowerPoint, spreadsheets, Markdown, or a ZIP of a folder.",
  },
  {
    icon: FolderOpen,
    title: "Select files",
    detail: "Scope a question to one document, a folder, or the whole library.",
  },
  {
    icon: MessagesSquare,
    title: "Start chatting",
    detail: "Every answer cites the page and block it came from.",
  },
];

/**
 * First run: the three steps, plus a sample document so a reader can see a cited
 * answer before uploading anything of their own.
 */
export function Onboarding({
  onUploaded,
  className,
}: {
  onUploaded?: () => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(file.name);
    try {
      const form = new FormData();
      form.set("file", file);
      await apiUploadWithProgress(form, () => {});
      toast.success(`${file.name} queued for indexing`);
      onUploaded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const loadSample = async () => {
    setBusy("sample");
    try {
      const response = await fetch("/sample/getting-started.md");
      if (!response.ok) throw new Error("Sample document is unavailable");
      const text = await response.text();
      const file = new File([text], "Getting Started with PageIndex.md", {
        type: "text/markdown",
      });
      const form = new FormData();
      form.set("file", file);
      await apiUploadWithProgress(form, () => {});
      toast.success("Sample document queued — it will be ready in a moment");
      onUploaded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the sample");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 pt-2", className)}>
      <div>
        <h1 className="font-serif text-[26px] leading-snug text-ink">Welcome to PageIndex Reader</h1>
        <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
          A co-reader for long documents. PageIndex builds a tree for every file, so
          answers can point at the exact page and block they came from.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-xl border border-line bg-surface p-3.5">
            <step.icon className="size-4 text-brand-deep" aria-hidden />
            <p className="mt-2 text-[13px] font-medium text-ink">{step.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-muted">{step.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.pptx,.ppt,.csv,.md,.markdown,.txt,.zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button
          variant="primary"
          size="md"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
        >
          {busy && busy !== "sample" ? <Spinner className="size-3.5" /> : null} Upload my own document
        </Button>
        <Button variant="secondary" size="md" disabled={Boolean(busy)} onClick={() => void loadSample()}>
          {busy === "sample" ? <Spinner className="size-3.5" /> : null} Try the sample doc
        </Button>
      </div>

      <p className="text-[11px] text-ink-muted/80">
        The sample is a short Markdown guide, so it indexes in seconds and uses
        almost none of your page budget.
      </p>
    </div>
  );
}
