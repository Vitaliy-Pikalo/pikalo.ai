import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import AssistantDock from "@/components/AssistantDock";
import SiteHeader from "@/components/SiteHeader";
import { TOOLS } from "@/lib/nav";
import "./globals.css";

const publicSans = localFont({
  src: "./fonts/PublicSans-Variable.woff2",
  variable: "--font-public-sans",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pikalo.org"),
  title: {
    default: "Pikalo — U.S. money, explained for your first years here",
    template: "%s · Pikalo",
  },
  description:
    "Free tools that explain U.S. taxes, investing and retirement accounts for international students, immigrants and first-time filers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="mt-16 border-t border-line bg-surface print:hidden">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-12 pb-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Link href="/" className="text-lg font-bold tracking-tight">
                pikalo
              </Link>
              <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-slate">
                Pikalo explains U.S. tax rules and cites IRS sources. It isn&apos;t tax,
                legal or investment advice. For free help filing, find an{" "}
                <a
                  className="underline underline-offset-2 hover:text-ink"
                  href="https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers"
                >
                  IRS VITA clinic
                </a>{" "}
                or ask your school&apos;s international office.
              </p>
            </div>
            <FooterList
              title="Calculators"
              links={[
                ...TOOLS.map((t) => ({ href: t.href, label: t.label })),
                { href: "/traps", label: "Money traps" },
              ]}
            />
            <FooterList
              title="Pikalo"
              links={[
                { href: "/ask", label: "Ask a tax question" },
                { href: "/account", label: "My Pikalo" },
                { href: "/privacy", label: "Privacy" },
              ]}
            />
          </div>
          <p className="mx-auto max-w-6xl border-t border-line px-4 pt-6 pb-24 text-sm text-slate sm:px-6">
            © 2026 Pikalo
          </p>
        </footer>
        <AssistantDock />
      </body>
    </html>
  );
}

function FooterList({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
