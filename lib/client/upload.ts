export interface UploadEntry {
  name?: string;
  doc_id?: string;
  status?: string;
  error?: string;
}

export interface UploadResult {
  doc_id?: string;
  name?: string;
  /** ZIP bundles come back with one entry per file. */
  entries?: UploadEntry[];
  [key: string]: unknown;
}

/** Human summary of a ZIP bundle's per-entry outcome. */
export function summarizeEntries(result: UploadResult): {
  ok: number;
  failed: number;
  total: number;
} {
  const entries = result.entries ?? [];
  const failed = entries.filter((entry) => Boolean(entry.error) || entry.status === "failed").length;
  return { ok: entries.length - failed, failed, total: entries.length };
}
