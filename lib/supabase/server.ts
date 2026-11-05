import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client bound to the request's auth cookies. Uses the publishable
 * key: every query runs as the signed-in user under RLS.
 */
export async function createSupabaseServer() {
  // Read cookies first: it marks the render as request-time, so a prerender
  // defers here instead of evaluating the env check below at build time.
  const store = await cookies();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}
