/**
 * Weekly ingestion Lambda: wires AWS and Supabase clients into the tested
 * pipeline in lib/ingest/pipeline.ts. All logic lives there; this file only
 * does I/O.
 *
 * Env: BUCKET, SECRET_ARN, BEDROCK_MODEL_ID.
 * The secret is JSON: {"SUPABASE_URL": "...", "SUPABASE_SERVICE_ROLE_KEY": "..."}.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { CORPUS } from "../../lib/ingest/corpus";
import {
  EMBEDDING_DIMENSIONS,
  ingestCorpus,
  type IngestDeps,
  type PassageRow,
} from "../../lib/ingest/pipeline";

const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({});
const secrets = new SecretsManagerClient({});

const BUCKET = process.env.BUCKET!;
const SECRET_ARN = process.env.SECRET_ARN!;
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.titan-embed-text-v2:0";
const USER_AGENT = "PikaloIngest/0.1 (+https://pikalo.org)";
const UPSERT_BATCH = 50;
const FETCH_TIMEOUT_MS = 30_000;

async function supabaseConfig() {
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  let value: Record<string, unknown> = {};
  try {
    value = JSON.parse(res.SecretString ?? "{}");
  } catch {
    // fall through to the error below
  }
  if (!value.SUPABASE_URL || !value.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase secret is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return {
    url: value.SUPABASE_URL as string,
    key: value.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

export async function handler() {
  const db = await supabaseConfig();
  const headers = {
    apikey: db.key,
    Authorization: `Bearer ${db.key}`,
    "Content-Type": "application/json",
  };

  const deps: IngestDeps = {
    async fetchHtml(url) {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
      if (!(res.headers.get("content-type") ?? "").includes("text/html")) {
        throw new Error(`GET ${url} returned ${res.headers.get("content-type")}`);
      }
      return res.text();
    },
    async lastHash(docId) {
      try {
        const obj = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: `latest/${docId}.txt` }),
        );
        return (await obj.Body?.transformToString())?.trim() ?? null;
      } catch (e) {
        if ((e as { name?: string }).name === "NoSuchKey") return null;
        throw e;
      }
    },
    async archive(docId, hash, html) {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `raw/${docId}/${hash}.html`,
          Body: html,
          ContentType: "text/html; charset=utf-8",
        }),
      );
      await s3.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: `latest/${docId}.txt`, Body: hash }),
      );
    },
    async embed(text) {
      const res = await bedrock.send(
        new InvokeModelCommand({
          modelId: MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            inputText: text,
            dimensions: EMBEDDING_DIMENSIONS,
            normalize: true,
          }),
        }),
      );
      return JSON.parse(new TextDecoder().decode(res.body)).embedding as number[];
    },
    async upsert(rows: PassageRow[]) {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        // pgvector takes vectors as '[0.1,0.2,...]' strings over PostgREST.
        const batch = rows
          .slice(i, i + UPSERT_BATCH)
          .map((r) => ({ ...r, embedding: JSON.stringify(r.embedding) }));
        const res = await fetch(`${db.url}/rest/v1/passages?on_conflict=id`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(batch),
        });
        if (!res.ok) throw new Error(`upsert → ${res.status} ${await res.text()}`);
      }
    },
    async deleteStale(docId, before) {
      const q = new URLSearchParams({
        doc_id: `eq.${docId}`,
        updated_at: `lt.${before}`,
      });
      const res = await fetch(`${db.url}/rest/v1/passages?${q}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=minimal" },
      });
      if (!res.ok) throw new Error(`delete stale → ${res.status} ${await res.text()}`);
    },
    now: () => new Date(),
  };

  const results = await ingestCorpus(CORPUS, deps);
  console.log(JSON.stringify({ event: "ingest_complete", results }));
  const failed = results.filter((r) => r.status === "failed");
  if (failed.length) {
    throw new Error(
      `Ingestion failed for: ${failed.map((f) => `${f.docId} (${f.error})`).join(", ")}`,
    );
  }
  return results;
}
