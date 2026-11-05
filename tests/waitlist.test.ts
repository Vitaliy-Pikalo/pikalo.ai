import { describe, expect, it, vi } from "vitest";
import { joinWaitlist, SUCCESS_MESSAGE, type WaitlistStore } from "@/lib/waitlist";

const okStore = (): WaitlistStore & { insert: ReturnType<typeof vi.fn> } => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
});

const valid = { email: "  Ana@Example.COM ", segment: "international_student", school: "Penn State" };

describe("joinWaitlist", () => {
  it("normalizes email and inserts", async () => {
    const store = okStore();
    const res = await joinWaitlist(valid, store);
    expect(res.status).toBe("success");
    expect(store.insert).toHaveBeenCalledWith({
      email: "ana@example.com",
      segment: "international_student",
      school: "Penn State",
      source: "landing",
    });
  });

  it("stores null when school is empty", async () => {
    const store = okStore();
    await joinWaitlist({ ...valid, school: "" }, store);
    expect(store.insert.mock.calls[0][0].school).toBeNull();
  });

  it("rejects invalid email without inserting", async () => {
    const store = okStore();
    const res = await joinWaitlist({ ...valid, email: "nope" }, store);
    expect(res.status).toBe("error");
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing email with a readable message", async () => {
    const res = await joinWaitlist({ ...valid, email: null }, okStore());
    expect(res).toEqual({ status: "error", message: "Enter your email address." });
  });

  it("rejects unknown segment", async () => {
    const store = okStore();
    const res = await joinWaitlist({ ...valid, segment: "hacker" }, store);
    expect(res.status).toBe("error");
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("silently drops bots that fill the honeypot", async () => {
    const store = okStore();
    const res = await joinWaitlist({ ...valid, hp_field: "http://spam" }, store);
    expect(res.status).toBe("success");
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("gives duplicates the same reply as new signups", async () => {
    const store: WaitlistStore = {
      insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "dup" } }),
    };
    const res = await joinWaitlist(valid, store);
    expect(res).toEqual({ status: "success", message: SUCCESS_MESSAGE });
  });

  it("returns a generic error on other DB failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store: WaitlistStore = {
      insert: vi.fn().mockResolvedValue({ error: { code: "42501", message: "rls" } }),
    };
    const res = await joinWaitlist(valid, store);
    expect(res.status).toBe("error");
    spy.mockRestore();
  });
});
