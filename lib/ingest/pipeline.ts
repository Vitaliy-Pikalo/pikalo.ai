/**
 * Ingestion pipeline for one corpus document:
 * fetch → archive raw HTML → chunk → embed → upsert → delete stale chunks.
 *
 * All I/O is injected, so the logic is tested with fakes and the Lambda
 * only wires up AWS and Supabase clients. If the page hasn't changed since
 * the last run (same content hash), it's skipped and nothing is re-embedded.
 */

import { createHash } from "node:crypto";
import { chunkSections, htmlToSections, type Chunk } from "@/lib/ingest/chunk";
import type { CorpusDoc } from "@/lib/ingest/corpus";

export interface PassageRow {
  id: string;
  doc_id: string;
  doc_title: string;
  section: string;
  url: string;
  content: string;
  tax_year: number | null;
  embedding: number[];
  updated_at: string;
}

export interface IngestDeps {
  fetchHtml(url: string): Promise<string>;
  /** Returns the hash stored for the last successful run of this doc, if any. */
  lastHash(docId: string): Promise<string | null>;
  archive(docId: string, hash: string, html: string): Promise<void>;
  embed(text: string): Promise<number[]>;
  upsert(rows: PassageRow[]): Promise<void>;
  /** Deletes this doc's passages whose updated_at is older than `before`. */
  deleteStale(docId: string, before: string): Promise<void>;
  now(): Date;
}

export interface IngestResult {
  docId: string;
  status: "skipped_unchanged" | "ingested" | "failed";
  chunks: number;
  hash?: string;
  error?: string;
}

export const EMBEDDING_DIMENSIONS = 1024;
const MIN_CHUNKS = 1;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function ingestDoc(doc: CorpusDoc, deps: IngestDeps): Promise<IngestResult> {
  try {
    const html = await deps.fetchHtml(doc.url);
    const hash = sha256(html);
    if ((await deps.lastHash(doc.id)) === hash) {
      return { docId: doc.id, status: "skipped_unchanged", chunks: 0, hash };
    }

    const chunks: Chunk[] = chunkSections(doc, htmlToSections(html));
    if (chunks.length < MIN_CHUNKS) {
      // A page that suddenly has no content is more likely a block page or a
      // redesign than a real change; keep the old passages.
      throw new Error("page produced no chunks; keeping existing passages");
    }

    const runAt = deps.now().toISOString();
    const rows: PassageRow[] = [];
    for (const c of chunks) {
      const embedding = await deps.embed(c.content);
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
      rows.push({
        id: c.id,
        doc_id: c.docId,
        doc_title: c.docTitle,
        section: c.section,
        url: c.url,
        content: c.content,
        tax_year: c.taxYear ?? null,
        embedding,
        updated_at: runAt,
      });
    }

    await deps.upsert(rows);
    await deps.deleteStale(doc.id, runAt);
    // Archive last, so a stored hash always means the passages are in place.
    await deps.archive(doc.id, hash, html);
    return { docId: doc.id, status: "ingested", chunks: rows.length, hash };
  } catch (e) {
    return { docId: doc.id, status: "failed", chunks: 0, error: (e as Error).message };
  }
}

export async function ingestCorpus(
  docs: CorpusDoc[],
  deps: IngestDeps,
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  // Sequential on purpose: polite to irs.gov and within Bedrock rate limits.
  for (const doc of docs) results.push(await ingestDoc(doc, deps));
  return results;
}
