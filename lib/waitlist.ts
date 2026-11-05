import { z } from "zod";

export const SEGMENTS = [
  { value: "international_student", label: "International student" },
  { value: "recent_immigrant", label: "Recently moved to the U.S." },
  { value: "us_young_adult", label: "Grew up in the U.S., new to money stuff" },
  { value: "other", label: "Something else" },
] as const;

export const waitlistSchema = z.object({
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .max(254, "That email is too long.")
    .pipe(z.email({ error: "Enter a valid email address." })),
  segment: z.enum(
    ["international_student", "recent_immigrant", "us_young_adult", "other"],
    {
      message: "Pick the option that fits you best.",
    },
  ),
  school: z.string().trim().max(120, "School name is too long.").optional(),
  // Honeypot: real people never see or fill this field.
  hp_field: z.string().max(0).optional(),
});

export type WaitlistInput = z.infer<typeof waitlistSchema>;

export type WaitlistState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

// Same reply for new and duplicate emails so the form can't be used to
// check whether someone has signed up.
export const SUCCESS_MESSAGE = "You're on the list. We'll email you at launch.";

/** Minimal interface so the insert can be tested without a network call. */
export interface WaitlistStore {
  insert(row: {
    email: string;
    segment: string;
    school: string | null;
    source: string;
  }): Promise<{ error: { code?: string; message: string } | null }>;
}

const UNIQUE_VIOLATION = "23505";

export async function joinWaitlist(
  raw: Record<string, unknown>,
  store: WaitlistStore,
): Promise<WaitlistState> {
  const parsed = waitlistSchema.safeParse({
    ...raw,
    school: raw.school || undefined,
    hp_field: raw.hp_field || undefined,
  });

  if (!parsed.success) {
    // A filled honeypot means a bot: pretend it worked, store nothing.
    if (parsed.error.issues.some((i) => i.path[0] === "hp_field")) {
      return { status: "success", message: SUCCESS_MESSAGE };
    }
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const { email, segment, school } = parsed.data;
  const { error } = await store.insert({
    email,
    segment,
    school: school ?? null,
    source: "landing",
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "success", message: SUCCESS_MESSAGE };
    }
    console.error("waitlist insert failed", error.code, error.message);
    return {
      status: "error",
      message: "Couldn't save your email. Try again in a minute.",
    };
  }

  return { status: "success", message: SUCCESS_MESSAGE };
}
