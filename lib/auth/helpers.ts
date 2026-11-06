import { z } from "zod";

const DEFAULT_NEXT = "/account";
const PRODUCTION_ORIGIN = "https://pikalo.org";

/** Only same-site paths: blocks open redirects like //evil.com or https://evil.com. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_NEXT;
  }
  return next;
}

/**
 * Where magic links should send people back to. SITE_URL wins; otherwise
 * localhost in development, else production. Never trusts an arbitrary Host
 * header (Supabase also checks the redirect against its allowlist).
 */
export function siteOrigin(host: string | null | undefined, siteUrl: string | undefined) {
  if (siteUrl) return siteUrl.replace(/\/$/, "");
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return PRODUCTION_ORIGIN;
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export function parseEmail(value: unknown): string | null {
  const r = emailSchema.safeParse(value);
  return r.success ? r.data : null;
}
