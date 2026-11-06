import type { Metadata } from "next";
import AskBox from "@/components/AskBox";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Ask about U.S. taxes",
  description:
    "Ask a question about U.S. taxes as an immigrant or international student. Answers come from IRS publications, with sources, and numbers from tested calculators.",
};

export default function AskPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="Ask Pikalo">
        Ask about U.S. taxes in plain words. Answers come only from IRS publications and
        link to them, and any number about your situation comes from a tested calculator,
        not the AI. If an answer can&apos;t be checked against a source, Pikalo won&apos;t
        show it.
      </PageIntro>
      <AskBox />
    </div>
  );
}
