import { describe, expect, it } from "vitest";
import { supabaseHeaders } from "@/lib/ingest/supabase-headers";

describe("supabaseHeaders", () => {
  it("sends new sb_secret_ keys only as apikey (they are not JWTs)", () => {
    const h = supabaseHeaders("sb_secret_abc123");
    expect(h.apikey).toBe("sb_secret_abc123");
    expect(h).not.toHaveProperty("Authorization");
  });

  it("also sends legacy service_role JWTs as a Bearer token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig";
    expect(supabaseHeaders(jwt)).toMatchObject({
      apikey: jwt,
      Authorization: `Bearer ${jwt}`,
    });
  });

  it("always sets JSON content type", () => {
    expect(supabaseHeaders("sb_secret_x")["Content-Type"]).toBe("application/json");
  });
});
