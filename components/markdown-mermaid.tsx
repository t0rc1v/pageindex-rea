"use client";

import { Check, Copy, Download, Image as ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { downloadFile } from "@/lib/chat-export";

function filenameFor(kind: "svg" | "png" | "mmd"): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `diagram-${stamp}.${kind}`;
}

/** Rasterise a rendered SVG string to PNG through a canvas. */
async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not rasterise the diagram"));
      image.src = url;
    });
    const match = /viewBox="([\d.\-\s]+)"/.exec(svg);
    const box = match?.[1]?.trim().split(/\s+/).map(Number);
    const width = Math.max(320, Math.round(box?.[2] ?? image.naturalWidth ?? 900));
    const height = Math.max(200, Math.round(box?.[3] ?? image.naturalHeight ?? 600));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Mermaid fences in an answer. Rendering is lazy — the library is large and most
 * answers never contain a diagram — and the diagram can leave as SVG, PNG or the
 * original `.mmd` source.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          fontFamily: "var(--font-sans)",
        });
        const id = `pi-mermaid-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Diagram could not be rendered");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <figure className="group/diagram my-3 overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-muted">
          <ImageIcon className="size-3" aria-hidden />
          Diagram
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/diagram:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            title="Copy diagram source"
            aria-label="Copy diagram source"
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              });
            }}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
          <button
            type="button"
            title="Download diagram as SVG"
            onClick={() => svg && downloadFile(filenameFor("svg"), svg, "image/svg+xml")}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
          >
            SVG
          </button>
          <button
            type="button"
            title="Download diagram as PNG"
            onClick={() => {
              void (async () => {
                if (!svg) return;
                try {
                  const blob = await svgToPng(svg);
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = filenameFor("png");
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch {
                  /* rasterisation is best effort */
                }
              })();
            }}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
          >
            PNG
          </button>
          <button
            type="button"
            title="Download diagram as MMD"
            onClick={() => downloadFile(filenameFor("mmd"), code, "text/plain;charset=utf-8")}
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
          >
            MMD
          </button>
        </div>
      </div>
      <div className="overflow-x-auto px-3 py-3">
        {svg ? (
          // Mermaid output is generated from the model's fence, with
          // securityLevel "strict" applied above.
          <div dangerouslySetInnerHTML={{ __html: svg }} className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" />
        ) : error ? (
          <pre className="whitespace-pre-wrap font-mono text-[11.5px] text-ink-muted">{error}</pre>
        ) : (
          <div className="flex items-center gap-2 py-4 text-[11.5px] text-ink-muted">
            <Download className="size-3.5 animate-pulse" aria-hidden />
            Rendering diagram…
          </div>
        )}
      </div>
    </figure>
  );
}
