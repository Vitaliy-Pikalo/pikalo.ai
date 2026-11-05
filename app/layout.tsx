import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
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
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            pikalo
          </Link>
          <nav className="flex gap-5 text-sm text-slate">
            <Link href="/check" className="hover:text-ink">
              Residency checker
            </Link>
            <Link href="/#waitlist" className="hover:text-ink">
              Join waitlist
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mx-auto w-full max-w-5xl border-t border-line px-4 py-8 text-sm leading-relaxed text-slate sm:px-6">
          <p className="max-w-[68ch]">
            Pikalo is an educational tool. It explains how U.S. tax rules work and cites
            IRS sources, but it isn&apos;t tax, legal or investment advice and
            doesn&apos;t replace a tax professional. For free help filing, look for an{" "}
            <a
              className="underline underline-offset-2 hover:text-ink"
              href="https://www.irs.gov/individuals/free-tax-return-preparation-for-qualifying-taxpayers"
            >
              IRS VITA clinic
            </a>{" "}
            or ask your school&apos;s international office.
          </p>
          <p className="mt-3">© 2026 Pikalo</p>
        </footer>
      </body>
    </html>
  );
}
