/**
 * Headers for Supabase PostgREST with a server key.
 *
 * New secret keys (sb_secret_...) are not JWTs: Supabase rejects them in
 * `Authorization: Bearer`, and its gateway mints the internal JWT from the
 * `apikey` header alone. Legacy service_role keys are JWTs and go in both.
 */
export function supabaseHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  return headers;
}
