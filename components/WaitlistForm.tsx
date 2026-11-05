"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { joinWaitlistAction } from "@/app/actions";
import { SEGMENTS, type WaitlistState } from "@/lib/waitlist";

const initial: WaitlistState = { status: "idle" };

export default function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, initial);
  const successRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "success") successRef.current?.focus();
  }, [state.status]);

  const inputClass =
    "mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink";

  if (state.status === "success") {
    return (
      <p
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="rounded-lg border-l-4 border-stamp bg-stamp-soft px-5 py-4 font-medium"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form
      // Submit via onSubmit (not the `action` prop) so React doesn't reset
      // the fields when the server returns an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid max-w-xl gap-4"
    >
      <label className="block">
        <span className="font-semibold">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          maxLength={254}
          className={inputClass}
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? "waitlist-error" : undefined}
        />
      </label>

      <label className="block">
        <span className="font-semibold">Which fits you best?</span>
        <select name="segment" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose one
          </option>
          {SEGMENTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-semibold">
          School <span className="font-normal text-slate">(optional)</span>
        </span>
        <input
          type="text"
          name="school"
          maxLength={120}
          autoComplete="organization"
          className={inputClass}
        />
      </label>

      {/* Honeypot: hidden from people and screen readers; a name autofill won't match. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input type="text" name="hp_field" tabIndex={-1} autoComplete="new-password" />
        </label>
      </div>

      {state.status === "error" && (
        <p id="waitlist-error" role="alert" className="text-sm font-medium text-amber">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-md bg-ink px-5 py-2.5 font-semibold text-paper disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join the waitlist"}
      </button>
    </form>
  );
}
