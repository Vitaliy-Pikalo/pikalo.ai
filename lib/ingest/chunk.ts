/**
 * Turns an IRS web page into citable chunks.
 *
 * 1. htmlToSections: keep the page's main content, split it at headings,
 *    and remember each heading's anchor so citations deep-link to it.
 * 2. chunkSections: split each section on paragraph boundaries into chunks
 *    under a size limit, prefixing the section heading so every chunk
 *    reads on its own. Ids are a hash of doc + anchor + text, so re-running
 *    ingestion on an unchanged page produces the same ids.
 */

import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import type { CorpusDoc } from "@/lib/ingest/corpus";

export interface Section {
  heading: string;
  anchor: string;
  text: string;
}

export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  section: string;
  url: string;
  content: string;
  taxYear?: number;
}

const BLOCKS = new Set(["P", "LI", "TD", "TH", "DD", "DT", "PRE", "BLOCKQUOTE"]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4"]);
const DROP = "script, style, nav, footer, header, noscript, form, button, svg";

const clean = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export function htmlToSections(html: string): Section[] {
  const root = parse(html);
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  const main =
    (root.querySelector("main") as HTMLElement | null) ??
    (root.querySelector("article") as HTMLElement | null) ??
    root;

  const sections: Section[] = [];
  let current: Section = { heading: "", anchor: "", text: "" };
  const paras: string[] = [];
  const flush = () => {
    current.text = paras.join("\n\n");
    if (current.heading || current.text) sections.push(current);
    paras.length = 0;
  };

  const walk = (el: HTMLElement) => {
    for (const child of el.childNodes) {
      if (!(child as HTMLElement).tagName) continue;
      const node = child as HTMLElement;
      const tag = node.tagName.toUpperCase();
      if (HEADINGS.has(tag)) {
        flush();
        current = {
          heading: clean(node.text),
          anchor:
            node.getAttribute("id") ??
            node.querySelector("[id]")?.getAttribute("id") ??
            "",
          text: "",
        };
      } else if (BLOCKS.has(tag)) {
        const t = clean(node.text);
        if (t) paras.push(t);
      } else {
        walk(node);
      }
    }
  };
  walk(main);
  flush();
  return sections;
}

export interface ChunkOptions {
  maxChars?: number;
  /** Characters of the previous chunk repeated at the start of the next. */
  overlapChars?: number;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export function chunkSections(
  doc: Pick<CorpusDoc, "id" | "title" | "url" | "taxYear">,
  sections: Section[],
  { maxChars = 1200, overlapChars = 150 }: ChunkOptions = {},
): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (!s.text.trim()) continue;
    const paras = s.text.split(/\n{2,}/).flatMap((p) => splitLong(p, maxChars));
    const groups: string[] = [];
    let buf = "";
    for (const p of paras) {
      if (buf && buf.length + 2 + p.length > maxChars) {
        groups.push(buf);
        const tail = overlapChars > 0 ? buf.slice(-overlapChars) : "";
        buf = tail ? `${tail}\n\n${p}` : p;
        if (buf.length > maxChars) buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) groups.push(buf);

    const heading = s.heading || doc.title;
    const url = s.anchor ? `${doc.url}#${s.anchor}` : doc.url;
    groups.forEach((g, i) => {
      chunks.push({
        id: `${doc.id}:${hash(`${s.anchor}|${heading}|${i}|${g}`)}`,
        docId: doc.id,
        docTitle: doc.title,
        section: heading,
        url,
        content: `${heading}\n${g}`,
        taxYear: doc.taxYear,
      });
    });
  }
  return chunks;
}

/** Splits a single over-long paragraph at sentence ends. */
function splitLong(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const out: string[] = [];
  let buf = "";
  for (const sentence of p.split(/(?<=[.;:])\s+/)) {
    if (buf && buf.length + 1 + sentence.length > max) {
      out.push(buf);
      buf = sentence;
    } else {
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
  }
  if (buf) out.push(buf);
  // A single sentence longer than the limit is cut into pieces, never dropped.
  return out.flatMap((s) =>
    s.length <= max
      ? [s]
      : Array.from({ length: Math.ceil(s.length / max) }, (_, i) =>
          s.slice(i * max, (i + 1) * max),
        ),
  );
}
