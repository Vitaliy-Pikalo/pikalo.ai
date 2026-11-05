"use client";

import { startTransition, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { sendMagicLink, type LoginState } from "@/app/login/actions";

const initial: LoginState = { status: "idle", message: "" };

export default function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(sendMagicLink, initial);
  const linkFailed = params.get("error") === "link" && state.status === "idle";

  if (state.status === "sent") {
    return (
      <p
        role="status"
        className="max-w-xl rounded-lg border-l-4 border-stamp bg-stamp-soft px-5 py-4 font-medium"
      >
        {state.message}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="grid max-w-xl gap-4"
    >
      {linkFailed && (
        <p
          role="alert"
          className="rounded-md border border-amber bg-amber-soft px-4 py-3 text-amber"
        >
          That sign-in link didn&apos;t work. It may have expired or been used already.
          Send a new one.
        </p>
      )}
      <input type="hidden" name="next" value={params.get("next") ?? "/review"} />
      <label className="block">
        <span className="font-semibold">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          maxLength={254}
          className="mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? "login-error" : undefined}
        />
      </label>
      {state.status === "error" && (
        <p id="login-error" role="alert" className="text-amber">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-md bg-ink px-4 py-2 font-semibold text-surface disabled:opacity-50"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
