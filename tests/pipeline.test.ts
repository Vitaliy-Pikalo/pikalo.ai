import { describe, expect, it, vi, type Mock } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  ingestCorpus,
  ingestDoc,
  sha256,
  type IngestDeps,
} from "@/lib/ingest/pipeline";

const doc = { id: "spt", title: "SPT", url: "https://www.irs.gov/spt" };
const HTML = `<main><h2 id="a">Test</h2><p>Present at least 31 days.</p><h2 id="b">More</h2><p>Count 1/3 of days.</p></main>`;

function fakeDeps(overrides: Partial<IngestDeps> = {}) {
  const deps = {
    fetchHtml: vi.fn(async () => HTML),
    lastHash: vi.fn(async () => null),
    archive: vi.fn(async () => {}),
    embed: vi.fn(async () => Array(EMBEDDING_DIMENSIONS).fill(0.1)),
    upsert: vi.fn(async () => {}),
    deleteStale: vi.fn(async () => {}),
    now: () => new Date("2026-11-05T12:00:00Z"),
    ...overrides,
  };
  return deps;
}

describe("ingestDoc", () => {
  it("chunks, embeds, upserts, removes stale rows, then archives", async () => {
    const deps = fakeDeps();
    const r = await ingestDoc(doc, deps);
    expect(r).toMatchObject({ status: "ingested", chunks: 2, hash: sha256(HTML) });
    expect(deps.embed).toHaveBeenCalledTimes(2);
    const rows = (deps.upsert as Mock).mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      doc_id: "spt",
      url: "https://www.irs.gov/spt#a",
      updated_at: "2026-11-05T12:00:00.000Z",
    });
    expect(deps.deleteStale).toHaveBeenCalledWith("spt", "2026-11-05T12:00:00.000Z");
    // order: upsert → deleteStale → archive
    const order = [deps.upsert, deps.deleteStale, deps.archive].map(
      (f) => (f as Mock).mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("skips unchanged pages without embedding", async () => {
    const deps = fakeDeps({ lastHash: vi.fn(async () => sha256(HTML)) });
    const r = await ingestDoc(doc, deps);
    expect(r.status).toBe("skipped_unchanged");
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("keeps old passages when a page comes back empty", async () => {
    const deps = fakeDeps({ fetchHtml: vi.fn(async () => "<main></main>") });
    const r = await ingestDoc(doc, deps);
    expect(r.status).toBe("failed");
    expect(deps.upsert).not.toHaveBeenCalled();
    expect(deps.deleteStale).not.toHaveBeenCalled();
  });

  it("rejects embeddings of the wrong size before writing anything", async () => {
    const deps = fakeDeps({ embed: vi.fn(async () => [0.1, 0.2]) });
    const r = await ingestDoc(doc, deps);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/dimensions/);
    expect(deps.upsert).not.toHaveBeenCalled();
  });

  it("doesn't archive (so it retries next run) if the upsert fails", async () => {
    const deps = fakeDeps({
      upsert: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = await ingestDoc(doc, deps);
    expect(r).toMatchObject({ status: "failed", error: "db down" });
    expect(deps.archive).not.toHaveBeenCalled();
  });
});

describe("ingestCorpus", () => {
  it("keeps going when one document fails", async () => {
    const deps = fakeDeps({
      fetchHtml: vi.fn(async (url: string) => {
        if (url.includes("bad")) throw new Error("404");
        return HTML;
      }),
    });
    const r = await ingestCorpus(
      [{ ...doc, id: "bad", url: "https://www.irs.gov/bad" }, doc],
      deps,
    );
    expect(r.map((x) => x.status)).toEqual(["failed", "ingested"]);
  });
});
