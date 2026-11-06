import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="Sign in">
        Sign in to save your answers, so the calculators fill themselves in next time.
        We&apos;ll email you a one-time link: no password to remember. Pikalo never asks
        for your SSN or bank details.
      </PageIntro>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
