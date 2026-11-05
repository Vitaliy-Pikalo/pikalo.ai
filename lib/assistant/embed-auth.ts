/**
 * HMAC request signing between the Vercel app and the AWS embed Lambda.
 *
 * signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`))
 *
 * The timestamp is inside the MAC, and requests older or newer than
 * MAX_SKEW_SECONDS are refused, so a captured request can't be replayed later.
 * Used instead of OIDC because the AWS account's org policy blocks creating
 * OIDC providers.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 300;
export const TIMESTAMP_HEADER = "x-pikalo-timestamp";
export const SIGNATURE_HEADER = "x-pikalo-signature";

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_headers" | "stale" | "bad_signature" | "server_misconfigured";
    };

function mac(secret: string, timestamp: string, body: string): Buffer {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
}

export function signRequest(
  secret: string,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { timestamp: string; signature: string } {
  if (!secret) throw new Error("signing secret is empty");
  const timestamp = String(nowSeconds);
  return { timestamp, signature: mac(secret, timestamp, body).toString("hex") };
}

export function verifyRequest(
  secret: string,
  body: string,
  timestamp: string | undefined,
  signature: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!secret) return { ok: false, reason: "server_misconfigured" };
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };

  const ts = Number(timestamp);
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const expected = mac(secret, timestamp, body);
  const given = /^[0-9a-f]+$/i.test(signature) ? Buffer.from(signature, "hex") : Buffer.alloc(0);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
